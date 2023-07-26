const { declare } = require('@babel/helper-plugin-utils');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { exit } = require('process');
const generate = require('@babel/generator').default;
const child_process = require('child_process');
const shell = require('shelljs');

let intlIndex = 0;
function nextIntlKey() {
    ++intlIndex;
    return `intl${intlIndex}`;
}

const autoTrackPlugin = declare((api, options, dirname) => {
    api.assertVersion(7);

    if (!options.outputDir) {
        throw new Error('outputDir in empty');
    }else{
        console.log('default outputDir:', options.outputDir);
    }
    console.log('options:', options);
    if(options.excJsPath){
        const excJsRealPath = path.join(__dirname, '..', '..', options.excJsPath);
        console.log('currentDir:', excJsRealPath);
        // 只能执行纯 js 代码
        // eval(fs.readFileSync(excJsRealPath, {
        //     encoding: 'utf-8'
        // }));

        // child_process.execFileSync(excJsRealPath);

        // shell.exec(`node ${excJsRealPath}`);
    }

    function getReplaceExpression(path, value, intlUid) {
        const expressionParams = path.isTemplateLiteral() ? path.node.expressions.map(item => generate(item).code) : null
        let replaceExpression = api.template.ast(`${intlUid}.t('${value}'${expressionParams ? ',' + expressionParams.join(',') : ''})`).expression;
        if (path.findParent(p => p.isJSXAttribute()) && !path.findParent(p=> p.isJSXExpressionContainer())) {
            replaceExpression = api.types.JSXExpressionContainer(replaceExpression);
        }
        return replaceExpression;
    }

    function save(file, key, value) {
        const allText = file.get('allText');
        allText.push({
            key, value
        });
        file.set('allText', allText);
    }

    return {
        pre(file) {
            // console.log('prepare file:', file);
            file.set('allText', []);
        },
        visitor: {
            Program: {
                enter(path, state) {
                    let imported;
                    path.traverse({
                        ImportDeclaration(p) {
                            const source = p.node.source.value;
                            if(source === 'intl') {
                                imported = true;
                            }
                            options.replaceImports?.forEach((replaceImport, index) => {
                                if(source === replaceImport.module){
                                    let delIndex = -1;
                                    p.node.specifiers.forEach((value, index) => {
                                        if(replaceImport.component === value.imported.name){
                                            delIndex = index;
                                            return;
                                        }
                                    });
                                    if(delIndex > -1){
                                        p.node.specifiers.splice(delIndex, 1);
                                        let insertIndex = -1;
                                        path.node.body.forEach((value, index) => {
                                            if(value.type === 'ImportDeclaration' && value.source.value === source){
                                                insertIndex = index + 1;
                                                return;
                                            }
                                        });
                                        if(insertIndex > -1){
                                            path.node.body.splice(insertIndex, 0, api.template.ast(replaceImport.replaceStr));
                                        }
                                    }
                                }
                            });
                        }
                    });
                    if (!imported) {
                        const uid = path.scope.generateUid('intl');
                        // console.log('generateUid:', uid);
                        const importAst = api.template.ast(`import ${uid} from 'intl'`);
                        // console.log('importAst:', importAst);
                        // console.log(path.node.body);
                        // path.node.body.push(importAst);
                        // path.node.body.unshift(importAst);
                        let lastImportIndex = 0;
                        path.node.body.forEach((value, index) => {
                            if(value.type !== 'ImportDeclaration'){
                                lastImportIndex = index;
                                return;
                            }
                        });
                        path.node.body.splice(lastImportIndex, 0, importAst);
                        state.intlUid = uid;
                    }

                    path.traverse({
                        'StringLiteral|TemplateLiteral'(path) {
                            if(path.node.leadingComments) {
                                path.node.leadingComments = path.node.leadingComments.filter((comment, index) => {
                                    if (comment.value.includes('i18n-disable')) {
                                        path.node.skipTransform = true;
                                        return false;
                                    }
                                    return true;
                                })
                            }
                            if(path.findParent(p => p.isImportDeclaration())) {
                                path.node.skipTransform = true;
                            }
                        }
                    });
                }
            },
            StringLiteral(path, state) {
                if (path.node.skipTransform) {
                    return;
                }
                let key = nextIntlKey();
                save(state.file, key, path.node.value);

                const replaceExpression = getReplaceExpression(path, key, state.intlUid);
                path.replaceWith(replaceExpression);
                path.skip();
            },
            TemplateLiteral(path, state) {
                if (path.node.skipTransform) {
                    return;
                }
                const value = path.get('quasis').map(item => item.node.value.raw).join('{placeholder}');
                if(value) {
                    let key = nextIntlKey();
                    save(state.file, key, value);

                    const replaceExpression = getReplaceExpression(path, key, state.intlUid);
                    path.replaceWith(replaceExpression);
                    path.skip();
                }
                // path.get('quasis').forEach(templateElementPath => {
                //     const value = templateElementPath.node.value.raw;
                //     if(value) {
                //         let key = nextIntlKey();
                //         save(state.file, key, value);

                //         const replaceExpression = getReplaceExpression(templateElementPath, key, state.intlUid);
                //         templateElementPath.replaceWith(replaceExpression);
                //     }
                // });
                // path.skip();
            },
        },
        post(file) {
            const allText = file.get('allText');
            const intlData = allText.reduce((obj, item) => {
                obj[item.key] = item.value;
                return obj;
            }, {});

            const content = `const resource = ${JSON.stringify(intlData, null, 4)};\nexport default resource;`;
            fse.ensureDirSync(options.outputDir);
            fse.writeFileSync(path.join(options.outputDir, 'zh_CN.js'), content);
            fse.writeFileSync(path.join(options.outputDir, 'en_US.js'), content);
        }
    }
});
module.exports = autoTrackPlugin;
