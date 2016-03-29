/* jslint esnext:true, node:true, mocha:true */
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

const
    dbsInit = require('../../../../../test/mockup/dbs'),
    fs = require('fs'),
    Generator = require(LACKEY_PATH).generator,
    should = require('should');

describe('models/cms/server/models/content', () => {

    let ContentModel,
        ContentGenerator,
        ContentSerializer;

    before((done) => {
        dbsInit(() => {
            require('../../../server/models/content')
                .then((model) => {
                    ContentModel = model;
                    ContentGenerator = require('../../../server/models/content/generator');
                    ContentSerializer = require('../../../server/models/content/serializer');
                    done();
                });
        });
    });

    it('should begin with no content', function () {
        return ContentModel.removeAll()
            .then(() => {
                return ContentModel.count();
            })
            .then((count) => {
                count.should.be.eql(0);
                return true;
            }).should.finally.be.eql(true);
    });

    it('Creates', () => {
        return ContentModel.create({
            name: 'my page',
            route: '/page'
        }).then(() => {
            return true;
        }).should.finally.be.eql(true);
    });

    it('Queries', () => {
        return ContentModel.list({}).then(() => {
            return true;
        }).should.finally.be.eql(true);
    });

    it('Gets by route', () => {
        return ContentModel.findByRoute('/page').then((page) => {
            should.exist(page);
            page.name.should.be.eql('my page');
            return true;
        }).should.finally.be.eql(true);
    });

    it('Serializes Text ', () => {
        let input = fs.readFileSync(__dirname + '/lorem.md.txt', 'utf8').replace(/\n+$/, ''),
            parsedYaml = require('./fromyaml.json');
        return ContentSerializer.deserializeText(input).then((content) => {
            should.exist(content);
            JSON.parse(JSON.stringify(content)).should.be.eql(require('./lorem.json'));
            return ContentSerializer.serializeText(content);
        }).then((output) => {
            should.exist(output);
            output.should.be.eql(input);
            return ContentSerializer.deserialize(parsedYaml);
        }).then((output) => {
            should.exist(output);
            JSON.parse(JSON.stringify(output)).should.be.eql(require('./toyaml.json'));
            return ContentSerializer.serialize(output);
        }).then((output) => {
            JSON.parse(JSON.stringify(output)).should.be.eql(require('./final.json'));
            return true;
        }).should.finally.be.True;
    });



    it('Generates init data', function () {

        Generator.registerMapper('Content', ContentGenerator);
        return Generator.load(__dirname + '/../../../module.yml', true).then(() => {
            return true;
        }).should.finally.be.eql(true);
    });
});
