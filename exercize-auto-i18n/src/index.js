const { transformFromAstSync } = require('@babel/core');
const  parser = require('@babel/parser');
const autoI18nPlugin = require('./plugin/auto-i18n-plugin');
const fs = require('fs');
const path = require('path');
const lodash = require('lodash')

const sourceCode = fs.readFileSync(path.join(__dirname, './sourceCode.js'), {
    encoding: 'utf-8'
});

const ast = parser.parse(sourceCode, {
    sourceType: 'unambiguous',
    plugins: ['jsx']
});

const { code } = transformFromAstSync(ast, sourceCode, {
    plugins: [[autoI18nPlugin, {
        outputDir: path.resolve(__dirname, './output'),
        excJsPath: './src/exc/index.tsx',
        replaceImports:[{component: "a", module: "test-import", replaceStr: `import {Text} from '@/src/compent/Text.tsx'`}]
    }]]
});

class TestObject{
    name = 1;
}

class TestObject2{
    name = 1;
}

const testObject = new TestObject();

console.log('typeof:',  testObject instanceof TestObject2);

console.log('\n', code);
