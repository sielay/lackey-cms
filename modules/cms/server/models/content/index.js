/* eslint no-underscore-dangle:0 */
/* jslint node:true, esnext:true */
'use strict';
/*
    Copyright 2016 Enigma Marketing Services Limited

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

if (!GLOBAL.LACKEY_PATH) {
    /* istanbul ignore next */
    GLOBAL.LACKEY_PATH = process.env.LACKEY_PATH || __dirname + '/../../../../../lib';
}

const SUtils = require(LACKEY_PATH).utils,
    objection = require('objection'),
    SCli = require(LACKEY_PATH).cli,
    Model = objection.Model;

module.exports = SUtils.deps(
    SUtils.cmsMod('core').model('objection'),
    SUtils.cmsMod('users').model('user'),
    require('../taxonomy'),
    require('../template'),
    require('./knex')
).promised((ObjectionWrapper, User, Taxonomy, Template) => {

    class ContentModel extends Model {
        static get tableName() {
            return 'content';
        }

        static get jsonSchema() {
            return {
                type: 'object',
                required: ['type', 'route'],
                properties: {
                    type: {
                        type: 'string',
                        default: 'page'
                    },
                    name: {
                        type: 'string'
                    },
                    layout: {
                        type: 'object'
                    },
                    props: {
                        type: 'object'
                    },
                    route: {
                        type: 'string'
                    },
                    state: {
                        type: 'string'
                    },
                    userId: {
                        type: 'integer'
                    },
                    templateId: {
                        type: 'integer'
                    }
                }
            };
        }
    }

    class ContentToTaxonomy extends Model {
        static get tableName() {
            return 'contentToTaxonomy';
        }
    }

    /**
     * @class
     */
    class Content extends ObjectionWrapper {

        static get model() {
            return ContentModel;
        }

        static get api() {
            return '/cms/content';
        }

        get type() {
            return this._doc.type;
        }

        get props() {
            return this._doc.props || {};
        }

        _populate() {
            let self = this;
            return User.findById(this._doc.userId)
                .then((user) => {
                    self._user = user;
                    return Template.findById(this._doc.templateId);
                })
                .then((template) => {
                    self._template = template;
                    return SCli.sql(ContentToTaxonomy
                        .query()
                        .where('contentId', self.id));
                })
                .then((taxonomyIds) => {
                    return Taxonomy.findByIds(taxonomyIds.map((row) => row.taxonomyId));
                })
                .then((taxonomies) => {
                    self.taxonomies = taxonomies;
                    return self;
                });
        }

        _preSave() {

            if (this._doc.template) {
                this._doc.templateId = this._doc.template;
            }

            if (this._doc.author) {
                this._doc.userId = this._doc.author;
            }

            delete this._doc.template;
            delete this._doc.taxonomy;
            delete this._doc.author;

            if (this._doc.layout === undefined) {
                delete this._doc.layout;
            }

            return Promise.resolve(this);
        }

        _postSave(cached) {
            let promise = Promise.resolve(this),
                self = this;
            if (cached.taxonomy) {
                promise = promise
                    .then(() => {
                        return SCli.sql(ContentToTaxonomy
                            .query()
                            .delete()
                            .where('contentId', self.id));
                    })
                    .then(() => {
                        return SCli.sql(ContentToTaxonomy
                            .query()
                            .insert(cached.taxonomy.map((id) => {
                                return {
                                    contentId: self.id,
                                    taxonomyId: id
                                };
                            })));
                    });
            }

            return promise;
        }

        toJSON() {
            return {
                id: this.id,
                $uri: this.uri,
                type: this.type,
                name: this.name,
                route: this._doc.route,
                createdAt: this._doc.createdAt,
                props: this.props,
                author: this._user ? this._user.toJSON() : null,
                template: this._doc.template ? this._doc.template.toJSON() : null,
                state: this._doc.state,
                layout: this._doc.layout,
                taxonomies: this.taxonomies
            };
        }

        addTaxonomy(taxonomy) {
            let self = this;
            return SCli.sql(ContentToTaxonomy
                    .query()
                    .insert({
                        contentId: this.id,
                        taxonomyId: taxonomy.id
                    }))
                .then(() => {
                    return self._populate();
                });
        }

        removeTaxonomy(taxonomy) {
            let self = this;
            return SCli.sql(ContentToTaxonomy
                    .query()
                    .remove()
                    .where('contentId', this.id)
                    .where('taxonomyId', taxonomy.id)
                )
                .then(() => {
                    return self._populate();
                });
        }

        get route() {
            return this._doc.route;
        }


        get layout() {
            return this._doc.layout;
        }

        get uri() {
            return '/api/cms/content/' + this._doc.id.toString();
        }

        get state() {
            return this._doc.state;
        }

        getTemplatePath() {

            SCli.debug('lackey-cms/modules/cms/server/models/page', 'Get template path', (this._template && this._template.path && this._template.path.length) ? 'exists' : 'doesn\'t exist');

            if (this._template && this._template.path && this._template.path.length) {
                return this._template.path.toString();
            }
            return ['~/core/notemplate', 'cms/cms/notemplate', 'cms/cms/page'];
        }

        static getTypes() {
            return [
                'page',
                'block',
                'quote'
            ];
        }

        static getByTypeAndRoute(type, route) {
            return SCli.sql(ContentModel
                    .query()
                    .where('route', route)
                    .where('type', type))
                .then((results) => {
                    if (results && results.length) {
                        return new Content(results[0]);
                    }
                    return null;
                });
        }

        static findByRoute(route) {
            return this.findOneBy('route', route);
        }
    }
    require('./generator');
    return Content;
});
