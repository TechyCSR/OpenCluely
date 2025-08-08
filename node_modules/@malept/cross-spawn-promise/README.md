# `@malept/cross-spawn-promise`

> A promisified version of [`cross-spawn`](https://npm.im/cross-spawn) with slightly different behavior & extra options.

[![CI](https://github.com/malept/cross-spawn-promise/workflows/CI/badge.svg)](https://github.com/malept/cross-spawn-promise/actions?query=workflow%3ACI)
[![NPM package](https://img.shields.io/npm/v/@malept/cross-spawn-promise.svg)](https://www.npmjs.com/package/@malept/cross-spawn-promise)
[![codecov](https://codecov.io/gh/malept/cross-spawn-promise/branch/master/graph/badge.svg)](https://codecov.io/gh/malept/cross-spawn-promise)

## Different Behavior

If the spawned process exits with a non-zero code, an `ExitCodeError` is thrown with the original
command, code, `stdout`, and `stderr` as properties.

If the spawned process is terminated by a signal on non-Windows platforms, an `ExitSignalError` is
thrown with the original command, signal name, `stdout`, and `stderr` as properties.

## Extra Options

- `logger`: a `Function` such as `console.log` or `debug(name)` to log some information
  about the spawned process.
- `updateErrorCallback`: a callback which mutates the error before it is re-thrown. Most commonly,
  this is used to augment the error message of `ENOENT` error to provide a more human-friendly
  message as to how to install the missing executable.

## Legal

This module is licensed under the Apache 2.0 license.
