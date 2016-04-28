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

const SCli = require(LACKEY_PATH).cli,
  treeParser = require('../../../shared/treeparser');

module.exports = (dust) => {

  dust.helpers.block = function (chunk, context, bodies, params) {
    SCli.debug('lackey-cms/modules/cms/server/lib/dust/block');


    return chunk.map((injectedChunk) => {
      module.exports.block(
        params.content ? treeParser.get(params.content.layout, params.path) : {
          template: params.template,
          route: params.route
        },
        injectedChunk, context, bodies, params, dust, params.content ? params.content.id : null
      ).then(() => {
        injectedChunk.end();
      }, (error) => {
        dust.helpers.error(injectedChunk, error);
        console.log(error, error.stack);
        injectedChunk.end();
      });
    });
  };

};

module.exports.block = (config, injectedChunk, context, bodies, params, dust) => {

  SCli.debug('lackey-cms/modules/cms/server/lib/dust/block');

  if (!config) {
    return Promise.resolve(injectedChunk);
  }

  return new Promise((resolve, reject) => {

    SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'inner');

    let promise = Promise.resolve(),
      data = context,
      document;

    if (config.props) {
      SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'has props');
      data = data.push(config.props);
    }

    if (config.route) {
      SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'has route');
      promise = promise
        .then(() => {
          return require('../../models/content');
        }).then((Content) => {
          return Content.findByRoute(config.route);
        }).then((content) => {
          if (!content) {
            throw new Error('No referred document found ' + config.route);
          }
          SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'found content');
          document = content;
          data = data.push({
            data: {
              path: '',
              content: content.toJSON()
            }
          });
        });
    } else {
      SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'has no route');
      data = data.push({
        path: params.path + '.fields'
      });
    }

    if (!config.template && promise.route) {
      SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'no template and route');
      promise = promise.then(() => {
        if (!document) return;
        return require('../../models/template')
          .then((Template) => {
            return Template.findById(document._doc.templateId);
          })
          .then((templateObj) => {
            if (templateObj) {
              SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'got template from route');
              config.template = templateObj.path;
            }
          });
      });
    }


    promise.then(() => {
      SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'last steps');
      if (!config.template) {
        SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'no template');
        return resolve(injectedChunk);
      }

      SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'rendering');
      dust.render(config.template, data, (err, out) => {
        if (err) {
          console.error(err);
          reject(err);
        }
        injectedChunk.write(out);
        SCli.debug('lackey-cms/modules/cms/server/lib/dust/block', 'Rendered ');
        resolve(injectedChunk);
      });

    }, (error) => {
      reject(error);
    });


  });

};
