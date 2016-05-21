var recast = require('recast');
var fs = require('fs');

var entryFileName = process.argv[2];
var entrySource = fs.readFileSync(entryFileName, {encoding: 'utf8'});

var ast = recast.parse(entrySource);

console.log(ast);

processProgram(ast.program);

function processProgram(program) {
  var exports = {};
  var imports = {};
  program.body.forEach(function(node) {
    switch (node.type) {
    case 'ExportDefaultDeclaration':
      exports['default'] = node.declaration.name;
      break;
    case 'ExportNamedDeclaration':
      var name = node.declaration.id.name;
      exports[name] = node.declaration;
      break;
    case 'ImportDeclaration':
      node.specifiers.forEach(function(spec) {
        switch (spec.type) {
          case 'ImportDefaultSpecifier':
            imports[spec.local.name] = {
              source: node.source.value,
              imported: 'default'
            }
            break;
          case 'ImportSpecifier':
            imports[spec.local.name] = {
              source: node.source.value,
              imported: spec.local.name
            };
            break;
        }
      });
    }
  });

  console.log('exports', exports);
  console.log('imports', imports);
}
