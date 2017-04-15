var recast = require('recast');
var b = recast.types.builders;

var fs = require('fs');

var entryFileName = process.argv[2];

// Rewrite the entry file's AST to preserve style
var topLevelAst = readAst(entryFileName);

var requiredExports = {};
var order = readRequiredExports(entryFileName, requiredExports);
console.log(order);
console.log(requiredExports);

var newBody = [];
var rewritten = {};

for (var i = order.length - 1; i > -1; i--) {
  var fileName = order[i];
  if (rewritten[fileName]) {
    continue;
  }
  newBody = newBody.concat(rewriteFile(fileName, requiredExports));
  rewritten[fileName] = true;
}

topLevelAst.program.body = newBody;

topLevelAst.program.body.splice(0, 0, makeScope(rewritten));

console.log(recast.print(topLevelAst).code);

function readAst(fileName) {
  var source = fs.readFileSync(fileName, {encoding: 'utf8'});
  return recast.parse(source);
}

function readRequiredExports(fileName, requiredExports) {
  var ast = readAst(fileName);
  var localImports = readProgramImports(ast.program);
  var order = [fileName];

  for (var child in localImports) {
    if (!localImports.hasOwnProperty(child)) {
      continue;
    }
    if (!requiredExports[child]) {
      requiredExports[child] = {};
    }
    Object.assign(requiredExports[child], localImports[child]);
    order = order.concat(readRequiredExports(child, requiredExports));
  }
  return order;
}

function readProgramImports(program) {
  var imports = {};

  program.body.forEach(function(node) {
    switch (node.type) {
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
      });
      break;
    default:
      break;
    }
  });

  return imports;
}

function rewriteFile(fileName, requiredImports) {
  var ast = readAst(fileName);
  var body = rewriteProgram(fileName, ast.program, requiredImports[fileName]);

  return makeWrap(body);
}

function rewriteProgram(fileName, program, requiredImports) {
  var newBody = [];

  program.body.forEach(function(node) {
    switch (node.type) {
    case 'ExportDefaultDeclaration':

      newBody = newBody.concat(makeAssignment(fileName, 'default', node.declaration));
      break;
    case 'ExportNamedDeclaration':
      if (node.declaration) {
        newBody = newBody.concat(makeExport(fileName, node.declaration, requiredImports));
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

        newBody = newBody.concat(makeImportNamed(localName, source, remoteName));
      });
      break;
    default:
      newBody.push(node);
      break;
    }
  });

  return newBody;
}

// Export: scope[source].name = local
// Import: local = scope[source].name

function makeExport(fileName, declaration, requiredImports) {
  switch (declaration.type) {
  case 'VariableDeclaration':
    var output = [declaration];
    declaration.declarations.forEach(function(decl) {
      var declName = declarationName(decl);
      if (requiredImports[declName] || requiredImports.default) {
        output = output.concat(makeAssignment(fileName, declName, decl.init || decl.id));
      }
    });
    return output;
  case 'FunctionDeclaration':
    if (requiredImports[declarationName(declaration)] || requiredImports.default) {
      return makeAssignment(fileName, declarationName(declaration), declaration);
    } else {
      return [declaration];
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

function makeScope(requiredFiles) {
  var objectContents = Object.keys(requiredFiles).map(function(fileName) {
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
