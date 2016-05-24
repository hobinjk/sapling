var recast = require('recast');
var b = recast.types.builders;
var fs = require('fs');

var entryFileName = process.argv[2];

var processedFiles = {};
var topLevelAst = readAst(entryFileName);
topLevelAst.program.body = addData(entryFileName, []);
console.log(recast.print(topLevelAst).code);

function readAst(fileName) {
  var source = fs.readFileSync(fileName, {encoding: 'utf8'});
  return recast.parse(source);
}

function addData(fileName, output) {
  processedFiles[fileName] = true;
  var ast = readAst(fileName);
  var processOutput = processProgram(fileName, ast.program);

  // Ensure that all imported code exists in the output body
  processOutput.imports.forEach(function(importSource) {
    var importPath = resolvePath(fileName, importSource);
    if (!processedFiles[importPath]) {
      output = addData(importPath, output);
    }
  });

  // Combine this node's body with current body
  output = output.concat(processOutput.body);

  return output;
}

function processProgram(fileName, program) {
  var imports = [];
  var newBody = [];
  program.body.forEach(function(node) {
    switch (node.type) {
    case 'ExportDefaultDeclaration':

      newBody = newBody.concat(makeAssignment(fileName, 'default', node.declaration));
      break;
    case 'ExportNamedDeclaration':
      if (node.declaration) {
        newBody = newBody.concat(makeExport(fileName, node.declaration));
      } else if (node.specifiers) {
        node.specifiers.forEach(function(spec) {
          newBody = newBody.concat(makeAssignment(fileName, spec.exported.name, spec.local));
        });
      }
      break;
    case 'ImportDeclaration':
      node.specifiers.forEach(function(spec) {
        var localName = spec.local.name;
        var source = node.source.value;
        imports.push(source);
        switch (spec.type) {
          case 'ImportDefaultSpecifier':
            newBody = newBody.concat(makeImportNamed(localName, source, 'default'));
            break;
          case 'ImportSpecifier':
            newBody = newBody.concat(makeImportNamed(localName, source, localName));
            break;
        }
      });
      break;
    default:
      newBody.push(node);
      break;
    }
  });

  return {
    body: newBody,
    imports: imports
  };
}

// Export: scope[source].name = local
// Import: local = scope[source].name

function makeExport(fileName, declaration) {
  switch (declaration.type) {
  case 'VariableDeclaration':
    var output = [declaration];
    declaration.declarations.forEach(function(decl) {
      var declName = declarationName(decl);
      output = output.concat(makeAssignment(fileName, declName, decl.init || decl.id));
    });
    return output;
  case 'FunctionDeclaration':
    return makeAssignment(fileName, declarationName(declaration), declaration);
  }
}

function makeAssignable(declaration) {
  if (declaration.type === 'FunctionDeclaration') {
    return makeFunctionExpression(declaration);
  }
  return declaration;
}

function makeFunctionExpression(functionDeclaration) {
  // Might drop generator status or anything else weird
  return b.functionExpression(
    functionDeclaration.id,
    functionDeclaration.params,
    functionDeclaration.body
  );
}

function makeAssignment(fileName, exportName, local) {
  return [b.assignmentStatement('=', makeScope(fileName, exportName), makeAssignable(local))];
}

function declarationName(declaration) {
  return declaration.id.name;
}

function makeScope(fileName, exportName) {
  return b.memberExpression(
    b.memberExpression(
      b.identifier('scope'),
      b.literal(fileName)),
    b.literal(exportName));
}

function makeImportNamed(localName, source, exportName) {
  return b.variableDeclaration('var', [
    b.variableDeclarator(
      b.identifier(localName), makeScope(source, exportName))
  ]);
}

function resolvePath(originatingFileName, path) {
  return path;
}
