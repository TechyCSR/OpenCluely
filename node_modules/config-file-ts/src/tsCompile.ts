import * as ts from "typescript";
import { Program, EmitResult } from "typescript";
import path from "path";

export interface CompileResult {
  localSources: string[];
  compiled: boolean;
}

export function tsCompile(
  fileNames: string[],
  options: ts.CompilerOptions
): CompileResult {
  console.log("compiling:", fileNames);
  const program = ts.createProgram(fileNames, options);
  const sources = program
    .getSourceFiles()
    .map((f) => f.fileName)
    .filter((name) => !name.includes("node_modules"));
  const emitResult = program.emit();
  logDiagnostics(program, emitResult);

  return { localSources: sources, compiled: !emitResult.emitSkipped };
}

function logDiagnostics(program: Program, emitResult: EmitResult): void {
  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  allDiagnostics.forEach((diagnostic) => {
    if (diagnostic.file) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start!
      );
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n"
      );

      const filePath = path.resolve(diagnostic.file.fileName);
      console.log(
        `tsc: (${filePath}:${line + 1}:${character + 1}): ${message}`
      );
    } else {
      console.log(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      );
    }
  });
}
