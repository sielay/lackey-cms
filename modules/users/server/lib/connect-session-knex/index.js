/* jslint node:true, browser:true, esnext:true */
/* global LACKEY_PATH */
'use strict';
var util = require('util');

var oneDay = 86400000,
	parse = require('user-agent-parser'),
	SUtils = require(LACKEY_PATH).utils,
	collector = SUtils.cmsMod('analytics').path('server/lib/collector');

module.exports = function (connect) {

	/**
	 * Connect's Store.
	 */
	var Store = (connect.session) ? connect.session.Store : connect.Store;

	/*
	 * Return datastore appropriate string of the current time
	 * @api private
	 * @return {String}
	 */
	function dateAsISO(knex, aDate) {
		var date;
		if (aDate) {
			date = new Date(aDate);
		} else {
			date = new Date();
		}

		return date.toISOString();
	}

	/*
	 * Remove expired sessions from database.
	 * @param {Object} store
	 * @api private
	 */
	function dbCleanup(store) {
		return store.ready.then(function () {
			// sqlite3 date condition is a special case.
			var condition = 'expired < CAST(? as timestamp with time zone)';
			return store.knex(store.tablename).del()
				.whereRaw(condition, dateAsISO(store.knex));
		});
	}

	/*
	 * Initialize KnexStore with the given options.
	 *
	 * @param {Object} options
	 * @api public
	 */
	function KnexStore(opts) {
		var self = this,
			options = opts || {};

		Store.call(self, options);

		if (!options.clearInterval) {
			// Time to run clear expired function.
			options.clearInterval = 60000;
		}

		self.tablename = options.tablename || 'sessions';
		self.knex = options.knex || require('knex')({
			client: 'sqlite3',
			// debug: true,
			connection: {
				filename: 'connect-session-knex.sqlite'
			}
		});

		self.ready = self.knex.schema.hasTable(self.tablename)
			.then(function (exists) {
				if (!exists) {
					return self.knex.schema.createTable(self.tablename, function (table) {
						table.string('sid').primary();
						table.json('sess').notNullable();
						table.timestamp('expired').notNullable();
					});
				}
				return exists;
			})
			.then(function () {
				dbCleanup(self);
				self._clearer = setInterval(dbCleanup, options.clearInterval, self).unref();
				return null;
			});
	}

	// KnexStore.prototype.__proto__ = Store.prototype;
	util.inherits(KnexStore, Store);

	/*
	 * Attempt to fetch session by the given sid.
	 *
	 * @param {String} sid
	 * @param {Function} fn
	 * @api public
	 */
	KnexStore.prototype.get = function (sid, fn) {
		var self = this;
		return self.ready.then(function () {
			var condition = 'CAST(? as timestamp with time zone) <= expired';
			return self.knex
				.select('sess')
				.from(self.tablename)
				.where('sid', '=', sid)
				.andWhereRaw(condition, dateAsISO(self.knex))
				.then(function (response) {
					var ret;
					if (response[0]) {
						ret = response[0].sess;
						if (typeof ret === 'string') {
							ret = JSON.parse(ret);
						}
					}
					return ret;
				})
				.asCallback(fn);
		});
	};

	function currentUser(sess) {
		if(sess.userId) return sess.userId;
		if(sess.passport && sess.passport.user) return sess.passport.user;
		return null;
	}

	KnexStore.prototype.statSession = function (sid, sess) {
		if (currentUser(sess)) {
			this.knex.raw('UPDATE "users" SET "lastActive" = NOW() WHERE "id" = ?::integer', [currentUser(sess)]).then(() => {}, err => console.error(err));
		}
		return this.knex
			.raw(`SELECT count(*) FROM ${this.tablename} WHERE sid = ? AND "updated" <= ?::timestamp`, [sid, new Date()])
			.then(result => result.rows[0].count)
			.then(count => {
				if (+count === 0) {
					collector
						.then(c => c.log('session:perday:' + (currentUser(sess) || sess.ipAddress)))
						.catch(e => console.error(e));
				}
			});
	};

	/*
	 * Commit the given `sess` object associated with the given `sid`.
	 *
	 * @param {String} sid
	 * @param {Session} sess
	 * @param {Function} fn
	 * @api public
	 */
	KnexStore.prototype._set = function (sid, sess, fn) {

		var self = this;
		var maxAge = sess.cookie.maxAge;
		var now = new Date().getTime();
		var expired = maxAge ? now + maxAge : now + oneDay;
		var userId = 0;
		if (sess.passport) {
			userId = sess.passport.user;
		}
		var userAgent = sess.userAgent || '';
		var ipAddress = sess.ipAddress || '';
		var os = userAgent !== '' ? parse(userAgent).os.name : '';
		var browser = userAgent !== '' ? parse(userAgent).browser.name : '';
		var device = userAgent !== '' ? parse(userAgent).device.name : '';

		var sessJSON = JSON.stringify(sess);

		var postgresfastq = `with new_values (sid, expired, sess, "userId", "userAgent", "ipAddress", browser, os, device) as (
			  values (?, ?::timestamp with time zone, ?::json, ?::bigint, ?, ?, ?, ?, ?)
			),
			upsert as
			(
			  update ${self.tablename} cs set
				sid = nv.sid,
				expired = nv.expired,
				sess = nv.sess,
				"userId" = "nv"."userId",
				"userAgent" = "nv"."userAgent",
				"ipAddress" = "nv"."ipAddress",
				browser = nv.browser,
				os = nv.os,
				device = nv.device
			  from new_values nv
			  where cs.sid = nv.sid
			  returning cs.*
			)
			insert into ${self.tablename} (sid, expired, sess, "userId", "userAgent", "ipAddress", browser, os, device)
			select sid, expired, sess, "userId", "userAgent", "ipAddress", browser, os, device
			from new_values
			where not exists (select 1 from upsert up where up.sid = new_values.sid)`;

		var dbDate = dateAsISO(self.knex, expired);

		// postgresql optimized query
		return self.ready.then(function () {
			return self.knex.raw(postgresfastq, [sid, dbDate, sessJSON, userId, userAgent, ipAddress, browser, os, device])
				.asCallback(fn);
		});

	};

	KnexStore.prototype.set = function (sid, sess, fn) {
		this
			.statSession(sid, sess)
			.then(this._set.bind(this, sid, sess, fn));
	};


	/**
	 * Touch the given session object associated with the given session ID.
	 *
	 * @param {String} sid
	 * @param {Session} sess
	 * @param {Function} fn
	 * @public
	 */
	KnexStore.prototype._touch = function (sid, sess, fn) {
		if (sess && sess.cookie && sess.cookie.expires) {
			var condition = 'CAST(? as timestamp with time zone) <= expired';

			return this.knex(this.tablename)
				.where('sid', '=', sid)
				.andWhereRaw(condition, dateAsISO(this.knex))
				.update({
					expired: dateAsISO(this.knex, sess.cookie.expires),
					updated: dateAsISO(this.knex, new Date())
				})
				.asCallback(fn);
		}

		fn();
	};

	KnexStore.prototype.touch = function (sid, sess, fn) {
		this
			.statSession(sid, sess)
			.then(this._touch.bind(this, sid, sess, fn));
	};

	/*
	 * Destroy the session associated with the given `sid`.
	 *
	 * @param {String} sid
	 * @api public
	 */
	KnexStore.prototype.destroy = function (sid, fn) {
		var self = this;
		return self.ready.then(function () {
			return self.knex.del()
				.from(self.tablename)
				.where('sid', '=', sid)
				.asCallback(fn);
		});
	};


	/*
	 * Fetch number of sessions.
	 *
	 * @param {Function} fn
	 * @api public
	 */
	KnexStore.prototype.length = function (fn) {
		var self = this;
		return self.ready.then(function () {
			return self.knex.count('sid as count')
				.from(self.tablename)
				.then(function (response) {
					return response[0].count | 0;
				})
				.asCallback(fn);
		});
	};


	/*
	 * Clear all sessions.
	 *
	 * @param {Function} fn
	 * @api public
	 */
	KnexStore.prototype.clear = function (fn) {
		var self = this;
		return self.ready.then(function () {
			return self.knex.del()
				.from(self.tablename)
				.asCallback(fn);
		});
	};

	return KnexStore;

};
