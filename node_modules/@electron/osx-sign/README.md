# @electron/osx-sign [![npm][npm_img]][npm_url] [![Build Status][circleci_img]][circleci_url]

Codesign Electron macOS apps

## About

[`@electron/osx-sign`][electron-osx-sign] minimizes the extra work needed to eventually prepare your apps for shipping, providing the most basic tools and assets. Note that the bare necessities here are sufficient for enabling app sandbox, yet other configurations for network access etc. require additional work.

*NB: Since [`@electron/osx-sign`][electron-osx-sign] injects the entry `com.apple.security.application-groups` into the entitlements file as part of the pre-signing process, this would reportedly limit app transfer on iTunes Connect (see [#150](https://github.com/electron/osx-sign/issues/150)). However, opting out entitlements automation `opts['preAutoEntitlements'] === false` may result in worse graphics performance.*

*The signing procedure implemented in this package is based on what described in [Code Signing Guide](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md).*

## Installation

```sh
# For use in npm scripts
npm install --save @electron/osx-sign
# yarn
yarn add @electron/osx-sign
```

```sh
# For use from CLI
npm install -g @electron/osx-sign
# Yarn
yarn global add @electron/osx-sign
```

*Note: `@electron/osx-sign` is a dependency of [`electron-packager`](https://github.com/electron/electron-packager) as of 6.0.0 for signing apps on macOS. However, feel free to install this package globally for more customization beyond specifying identity and entitlements.*

## Usage

### Code Signing

#### From the API

```javascript
const { signAsync } = require('@electron/osx-sign')
signAsync({
  app: 'path/to/my.app'
})
  .then(function () {
    // Application signed
  })
  .catch(function (err) {
    // Handle the error
  })
```

###### opts - Options

**Required**

`app` - *String*

Path to the application package.
Needs file extension `.app`.

**Optional**

`binaries` - *Array*

Path to additional binaries that will be signed along with built-ins of Electron.
Default to `undefined`.

`optionsForFile` - *Function*

Function that receives the path to a file and can return the entitlements to use for that file to override the default behavior.  The
object this function returns can include any of the following optional keys.

| Option            | Description                                                                                                                                                                                                                               | Usage Example                                                         |
|-------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| `entitlements`    | String specifying the path to an `entitlements.plist` file. Will default to built-in entitlements files. Can also be an array of entitlement keys that osx-sign will write to an entitlements file for you.                               | `'path/to/entitlements'`                                        |
| `hardenedRuntime` | Boolean flag to enable the Hardened Runtime when signing the app. Enabled by default.                                                                                                                                                     | `false`                                                         |
| `requirements`    | String specifying the [requirements](https://developer.apple.com/library/mac/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html) that you recommend to be used to evaluate the code signature.       | `'anchor apple or anchor = "/var/db/yourcorporateanchor.cert"'` |
| `signatureFlags`  | List of [code signature flags](https://developer.apple.com/documentation/security/seccodesignatureflags?language=objc). Accepts an array of strings or a comma-separated string.                                                          | `['kSecCodeSignatureRestrict']`                                 |
| `timestamp`       | String specifying the URL of the timestamp authority server. Defaults to the server provided by Apple. Please note that this default server may not support signatures not furnished by Apple. Disable the timestamp service with `none`. | `'https://different.timeserver'`                                |

**Note:** Only available via the JS API

`identity` - *String*

Name of certificate to use when signing.
Default to be selected with respect to `provisioning-profile` and `platform` from `keychain` or keychain by system default.

Signing platform `mas` will look for `3rd Party Mac Developer Application: * (*)`, and platform `darwin` will look for `Developer ID Application: * (*)` by default.

`identityValidation` - *Boolean*

Flag to enable/disable validation for the signing identity. If enabled, the `identity` provided will be validated in the `keychain` specified.
Default to `true`.

`keychain` - *String*

The keychain name.
Default to system default keychain.

`ignore` - *RegExp|Function|Array.<(RegExp|Function)>*

Regex, function or an array of regex's and functions that signal skipping signing a file.
Elements of other types are treated as `RegExp`.
Default to `undefined`.

`platform` - *String*

Build platform of Electron.
Allowed values: `darwin`, `mas`.
Default to auto detect by presence of `Squirrel.framework` within the application bundle.

`preAutoEntitlements` - *Boolean*

Flag to enable/disable automation of `com.apple.security.application-groups` in entitlements file and update `Info.plist` with `ElectronTeamID`.
Default to `true`.

`preEmbedProvisioningProfile` - *Boolean*

Flag to enable/disable embedding of provisioning profile in the current working directory.
Default to `true`.

`provisioningProfile` - *String*

Path to provisioning profile.

`strictVerify` - *Boolean|String|Array.<String>*

Flag to enable/disable `--strict` flag when verifying the signed application bundle.
If provided as a string, each component should be separated with comma (`,`).
If provided as an array, each item should be a string corresponding to a component.
Default to `true`.

`type` - *String*

Specify whether to sign app for development or for distribution.
Allowed values: `development`, `distribution`.
Default to `distribution`.

`version` - *String*

Build version of Electron.
Values may be like: `1.1.1`, `1.2.0`.
Default to latest Electron version.

It is recommended to utilize this option for best support of specific Electron versions. This may trigger pre/post operations for signing: For example, automation of setting `com.apple.security.application-groups` in entitlements file and of updating `Info.plist` with `ElectronTeamID` is enabled for all versions starting from `1.1.1`; set `preAutoEntitlements` option to `false` to disable this feature.

#### From the Command Line

```sh
electron-osx-sign app [embedded-binary ...] [options ...]
```

##### Examples

Since `electron-osx-sign` adds the entry `com.apple.developer.team-identifier` to a temporary copy of the specified entitlements file (with the default option `--pre-auto-entitlements`) distribution builds can no longer be run directly. To run the app codesigned for distribution locally after codesigning, you may manually add `ElectronTeamID` in your `Info.plist` and `com.apple.security.application-groups` in the entitlements file, and provide the flag `--no-pre-auto-entitlements` for `electron-osx-sign` to avoid this extra bit. Note that "certain features are only allowed across apps whose team-identifier value match" ([Technical Note TN2415](https://developer.apple.com/library/content/technotes/tn2415/_index.html#//apple_ref/doc/uid/DTS40016427-CH1-ENTITLEMENTSLIST)).

The examples below assume that `--pre-auto-entitlements` is enabled.

- To sign a distribution version by default:
  ```sh
  electron-osx-sign path/to/my.app
  ```
  For distribution in the Mac App Store: Have the provisioning profile for distribution placed in the current working directory and the signing identity installed in the default keychain. *The app is not expected to run after codesigning since there is no provisioned device, and it is intended only for submission to iTunes Connect.*
  For distribution outside the Mac App Store: Have the signing identity for distribution installed in the default keychain and optionally place the provisioning profile in the current working directory. By default App Sandbox is not enabled. *The app should run on all devices.*

- To sign development version:
  ```sh
  electron-osx-sign path/to/my.app --type=development
  ```
  For testing Mac App Store builds: Have the provisioning profile for development placed in the current working directory and the signing identity installed in the default keychain. *The app will only run on provisioned devices.*
  For testing apps for distribution outside the Mac App Store, have the signing identity for development installed in the default keychain and optionally the provisioning profile placed in the current working directory. *The app will only run on provisioned devices.* However, you may prefer to just go with signing a distribution version because the app is expected to launch properly after codesigned.

- It is recommended to place the provisioning profile(s) under the working directory for `electron-osx-sign` to pick up automatically; however, to specify provisioning profile to be embedded explicitly:
  ```sh
  electron-osx-sign path/to/my.app --provisioning-profile=path/to/my.provisionprofile
  ```

- To specify custom entitlements files you have to use the JS API.

- It is recommended to make use of `--version` while signing legacy versions of Electron:
  ```sh
  electron-osx-sign path/to/my.app --version=0.34.0
  ```

Run `electron-osx-sign --help` or see [electron-osx-sign-usage.txt](https://github.com/electron/osx-sign/blob/main/bin/electron-osx-sign-usage.txt) for CLI-specific options.

### electron-osx-flat

#### From the API

```javascript
const { flatAsync } = require('@electron/osx-sign')
flatAsync({
  app: 'path/to/my.app'
})
  .then(function () {
    // Application flattened
  })
  .catch(function (err) {
    // Handle the error
  })
```

###### opts - Options

**Required**

`app` - *String*

Path to the application bundle.
Needs file extension `.app`.

**Optional**

`identity` - *String*

Name of certificate to use when signing.
Default to be selected with respect to `platform` from `keychain` or keychain by system default.

Flattening platform `mas` will look for `3rd Party Mac Developer Installer: * (*)`, and platform `darwin` will look for `Developer ID Installer: * (*)` by default.

`identityValidation` - *Boolean*

Flag to enable/disable validation for signing identity. If enabled, the `identity` provided will be validated in the `keychain` specified.
Default to `true`.

`install` - *String*

Path to install the bundle.
Default to `/Applications`.

`keychain` - *String*

The keychain name.
Default to system default keychain.

`platform` - *String*

Build platform of Electron. Allowed values: `darwin`, `mas`.
Default to auto detect by presence of `Squirrel.framework` within the application bundle.

`pkg` - *String*

Path to the output the flattened package.
Needs file extension `.pkg`.

`scripts` - *String*
Path to a directory containing pre and/or post install scripts.
#### From the Command Line

```sh
electron-osx-flat app [options ...]
```

Example:

```sh
electron-osx-flat path/to/my.app
```

Run `electron-osx-flat --help` or see [electron-osx-flat-usage.txt](https://github.com/electron/osx-sign/blob/main/bin/electron-osx-flat-usage.txt) for CLI-specific options.

## Debug

As of release v0.3.1, external module `debug` is used to display logs and messages; remember to `export DEBUG=electron-osx-sign*` when necessary.

## Test

The project's configured to run automated tests on CircleCI.

If you wish to manually test the module, first comment out `opts.identity` in `test/basic.js` to enable auto discovery. Then run the command `npm test` from the dev directory.

When this command is run for the first time: `@electron/get` will download macOS Electron releases defined in `test/config.json`, and save to `~/.electron/`, which might take up less than 1GB of disk space.

A successful testing should look something like:

```
$ npm test

> electron-osx-sign@0.4.17 pretest electron-osx-sign
> rimraf test/work

> electron-osx-sign@0.4.17 test electron-osx-sign
> standard && tape test

Calling @electron/get before running tests...
Running tests...
TAP version 13
# setup
# defaults-test:v7.0.0-beta.3-darwin-x64
ok 1 app signed
# defaults-test:v7.0.0-beta.3-mas-x64
ok 2 app signed
# defaults-test:v6.0.3-darwin-x64
ok 3 app signed
# defaults-test:v6.0.3-mas-x64
ok 4 app signed
# defaults-test:v5.0.10-darwin-x64
ok 5 app signed
# defaults-test:v5.0.10-mas-x64
ok 6 app signed
# defaults-test:v4.2.9-darwin-x64
ok 7 app signed
# defaults-test:v4.2.9-mas-x64
ok 8 app signed
# defaults-test:v3.1.2-darwin-x64
ok 9 app signed
# defaults-test:v3.1.2-mas-x64
ok 10 app signed
# teardown

1..10
# tests 10
# pass  10

# ok
```

[Electron]: https://github.com/electron/electron
[electron-osx-sign]: https://github.com/electron/osx-sign
[npm_img]: https://img.shields.io/npm/v/@electron/osx-sign.svg
[npm_url]: https://npmjs.org/package/@electron/osx-sign
[circleci_img]: https://img.shields.io/circleci/build/github/electron/osx-sign
[circleci_url]: https://circleci.com/gh/electron/osx-sign
