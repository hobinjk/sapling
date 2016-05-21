var recast = require('recast');
var fs = require('fs');

var entryFileName = process.argv[2];

var fileInfo = {};
addData(fileInfo, process.argv[2]);

function addData(fileInfo, fileName) {
  var entrySource = fs.readFileSync(entryFileName, {encoding: 'utf8'});
  var ast = recast.parse(entrySource);
  var newInfo = processProgram(ast.program);
  fileInfo[fileName] = newInfo;

  for (var importName in newInfo.imports) {
    var importPath = resolvePath(fileName, newInfo.imports[importName].source);
    if (typeof(fileInfo[importPath]) === 'undefined') {
      addData(fileInfo, importPath);
    }
  }
}

function processProgram(program) {
  var exports = {};
  var imports = {};
  program.body.forEach(function(node) {
    switch (node.type) {
    case 'ExportDefaultDeclaration':
      exports['default'] = node.declaration.name;
      break;
    case 'ExportNamedDeclaration':
      if (node.declaration) {
        var name = node.declaration.id.name;
        exports[name] = node.declaration;
      } else if (node.specifiers) {
        // TODO support export {varA as exportedA}
        node.specifiers.forEach(function(spec) {
          var name = spec.exported.name;
          exports[name] = spec.local.name;
        });
      }
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

  return {
    exports: exports,
    imports: imports
  };
}

function resolvePath(originatingFileName, path) {
  return path;
}

console.log(JSON.stringify(fileInfo));
