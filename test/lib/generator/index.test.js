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

const Generator = require('../../../lib/generator'),
    BbPromise = require('bluebird'),
    lackey = require('../../../lib'),
    should = require('should');

describe('lib/generator', () => {

    let oldConf;

    it('Loads', () => {
        return Generator.load(__dirname + '/../../../modules/users/module.yml').then((doc) => {
            should.exist(doc);
            doc.should.be.Object;
            return true;
        });
    });

    it('Mappers', () => {

        Generator.registerMapper('Role', (list) => {
            return BbPromise.resolve(true);
        });

        return Generator.load(__dirname + '/../../../modules/users/module.yml').then((doc) => {
            should.exist(doc);
            doc.should.be.Array;
            return true;
        });

    });

});
