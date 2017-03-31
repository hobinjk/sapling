var recast = require('recast');
var b = recast.types.builders;
var fs = require('fs');

var entryFileName = process.argv[2];

var processedFiles = {};
var topLevelAst = readAst(entryFileName);
topLevelAst.program.body = addData(entryFileName, [], {'default': true});
topLevelAst.program.body.splice(0, 0, makeScope(processedFiles));

console.log(recast.print(topLevelAst).code);

function readAst(fileName) {
  var source = fs.readFileSync(fileName, {encoding: 'utf8'});
  return recast.parse(source);
}

function addData(fileName, output, usedImports) {
  processedFiles[fileName] = true;
  var ast = readAst(fileName);
  var processOutput = processProgram(fileName, ast.program, usedImports);

  // Ensure that all imported code exists in the output body
  for (var importSource in processOutput.imports) {
    if (!processOutput.imports.hasOwnProperty(importSource)) {
      continue;
    }
    var usedImports = processOutput.imports[importSource];
    var importPath = resolvePath(fileName, importSource);
    if (!processedFiles[importPath]) {
      output = addData(importPath, output, usedImports);
    }
  }

  // Combine this node's body with current body
  output = output.concat(makeWrap(processOutput.body));

  return output;
}

function processProgram(fileName, program, usedImports) {
  var imports = {};
  var newBody = [];

  program.body.forEach(function(node) {
    switch (node.type) {
    case 'ExportDefaultDeclaration':

      newBody = newBody.concat(makeAssignment(fileName, 'default', node.declaration));
      break;
    case 'ExportNamedDeclaration':
      if (node.declaration) {
        newBody = newBody.concat(makeExport(fileName, node.declaration, usedImports));
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
        var remoteName = localName;
        if (spec.type === 'ImportDefaultSpecifier') {
          remoteName = 'default';
        }

        if (!imports[source]) {
          imports[source] = {};
        }
        imports[source][remoteName] = true;
        newBody = newBody.concat(makeImportNamed(localName, source, remoteName));
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

function makeExport(fileName, declaration, usedImports) {
  switch (declaration.type) {
  case 'VariableDeclaration':
    var output = [declaration];
    declaration.declarations.forEach(function(decl) {
      var declName = declarationName(decl);
      if (usedImports[declName] || usedImports.default) {
        output = output.concat(makeAssignment(fileName, declName, decl.init || decl.id));
      }
    });
    return output;
  case 'FunctionDeclaration':
    if (usedImports[declarationName(declaration)] || usedImports.default) {
      return makeAssignment(fileName, declarationName(declaration), declaration);
    } else {
      return [];
    }
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
  var scopeRef = makeScopeRef(fileName, exportName);
  // Anonymous export
  if (!local.id) {
    return [b.assignmentStatement('=', scopeRef, makeAssignable(local))];
  } else {
    return [local, b.assignmentStatement('=', scopeRef, local.id)];
  }
}

function declarationName(declaration) {
  return declaration.id.name;
}

function makeScopeRef(fileName, exportName) {
  return b.memberExpression(
    b.memberExpression(
      b.identifier('scope'),
      b.literal(fileName)),
    b.literal(exportName));
}

function makeImportNamed(localName, source, exportName) {
  return b.variableDeclaration('var', [
    b.variableDeclarator(
      b.identifier(localName), makeScopeRef(source, exportName))
  ]);
}

function makeScope(processedFiles) {
  var objectContents = Object.keys(processedFiles).map(function(fileName) {
    return b.property('init', b.literal(fileName), b.objectExpression([]));
  });

  return b.variableDeclaration('var', [
    b.variableDeclarator(
      b.identifier('scope'),
      b.objectExpression(objectContents))]);
}

function makeWrap(body) {
  return b.expressionStatement(b.callExpression(
    b.functionExpression(
      null,
      [b.identifier('scope')],
      b.blockStatement(body)
    ),
    [b.identifier('scope')]));
}

function resolvePath(originatingFileName, path) {
  return path;
}
