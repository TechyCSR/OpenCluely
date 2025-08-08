Electron Notarize
-----------

> Notarize your Electron apps seamlessly for macOS

[![CircleCI status](https://circleci.com/gh/electron/notarize.svg?style=shield)](https://circleci.com/gh/electron/notarize)
[![NPM package](https://img.shields.io/npm/v/@electron/notarize)](https://npm.im/@electron/notarize)

## Installation

```bash
# npm
npm install @electron/notarize --save-dev

# yarn
yarn add @electron/notarize --dev
```

## What is app "notarization"?

From Apple's docs in XCode:

> A notarized app is a macOS app that was uploaded to Apple for processing before it was distributed. When you export a notarized app from Xcode, it code signs the app with a Developer ID certificate and staples a ticket from Apple to the app. The ticket confirms that you previously uploaded the app to Apple.

> On macOS 10.14 and later, the user can launch notarized apps when Gatekeeper is enabled. When the user first launches a notarized app, Gatekeeper looks for the app’s ticket online. If the user is offline, Gatekeeper looks for the ticket that was stapled to the app.

Apple has made this a hard requirement as of 10.15 (Catalina).

## Prerequisites

For notarization, you need the following things:

1. Xcode 10 or later installed on your Mac.
2. An [Apple Developer](https://developer.apple.com/) account.
3. [An app-specific password for your ADC account’s Apple ID](https://support.apple.com/HT204397).
4. Your app may need to be signed with `hardened-runtime`, including the following entitlement:
    1. `com.apple.security.cs.allow-jit`

  If you are using Electron 11 or below, you must add the `com.apple.security.cs.allow-unsigned-executable-memory` entitlement too.
  When using version 12+, this entitlement should not be applied as it increases your app's attack surface.

## API

### Method: `notarize(opts): Promise<void>`

* `options` Object
  * `tool` String - The notarization tool to use, default is `notarytool`.  Can be `legacy` or `notarytool`. `notarytool` is substantially (10x) faster and `legacy` is deprecated and will **stop working** on November 1st 2023.
  * `appPath` String - The absolute path to your `.app` file
  * There are different options for each tool: Notarytool
    * There are three authentication methods available: user name with password:
      * `appleId` String - The username of your apple developer account
      * `appleIdPassword` String - The [app-specific password](https://support.apple.com/HT204397) (not your Apple ID password).
      * `teamId` String - The team ID you want to notarize under.
    * ... or apiKey with apiIssuer:
      * `appleApiKey` String - Absolute path to the `.p8` file containing the key. Required for JWT authentication. See Note on JWT authentication below.
      * `appleApiKeyId` String - App Store Connect API key ID, for example, `T9GPZ92M7K`. Required for JWT authentication. See Note on JWT authentication below.
      * `appleApiIssuer` String - Your App Store Connect API key issuer, for example, `c055ca8c-e5a8-4836-b61d-aa5794eeb3f4`. Required if `appleApiKey` is specified.
    * ... or keychain with keychainProfile:
      * `keychain` String (optional) - The name of the keychain or path to the keychain you stored notarization credentials in. If omitted, iCloud keychain is used by default.
      * `keychainProfile` String - The name of the profile you provided when storing notarization credentials.
  * ... or Legacy
    * `appBundleId` String - The app bundle identifier your Electron app is using.  E.g. `com.github.electron`
    * `ascProvider` String (optional) - Your [Team Short Name](#notes-on-your-team-short-name).
    * There are two authentication methods available: user name with password:
      * `appleId` String - The username of your apple developer account
      * `appleIdPassword` String - The [app-specific password](https://support.apple.com/HT204397) (not your Apple ID password).
    * ... or apiKey with apiIssuer:
      * `appleApiKey` String - Required for JWT authentication. See Note on JWT authentication below.
      * `appleApiIssuer` String - Issuer ID. Required if `appleApiKey` is specified.

## Safety when using `appleIdPassword`

1. Never hard code your password into your packaging scripts, use an environment
variable at a minimum.
2. It is possible to provide a keychain reference instead of your actual password (assuming that you have already logged into
the Application Loader from Xcode).  For example:

```javascript
const password = `@keychain:"Application Loader: ${appleId}"`;
```

Another option is that you can add a new keychain item using either the Keychain Access app or from the command line using the `security` utility:

```bash
security add-generic-password -a "AC_USERNAME" -w <app_specific_password> -s "AC_PASSWORD"
```
where `AC_USERNAME` should be replaced with your Apple ID, and then in your code you can use:

```javascript
const password = `@keychain:AC_PASSWORD`;
```

## Notes on JWT authentication

You can obtain an API key from [Appstore Connect](https://appstoreconnect.apple.com/access/api). Create a key with _App Manager_ access. Note down the Issuer ID and download the `.p8` file. This file is your API key and comes with the name of `AuthKey_<appleApiKeyId>.p8`. This is the string you have to supply when calling `notarize`.

Based on the `ApiKey`, the legacy `altool` will look in the following places for that file:

* `./private_keys`
* `~/private_keys`
* `~/.private_keys`
* `~/.appstoreconnect/private_keys`

`notarytool` will not look for the key, and you must instead provide its path as the `appleApiKey` argument.

## Notes on your Team Short Name

If you are a member of multiple teams or organizations, you have to tell Apple on behalf of which organization you're uploading. To find your [team's short name](https://forums.developer.apple.com/thread/113798)), you can ask `iTMSTransporter`, which is part of the now deprecated `Application Loader` as well as the newer [`Transporter`](https://apps.apple.com/us/app/transporter/id1450874784?mt=12).

With `Transporter` installed, run:
```sh
/Applications/Transporter.app/Contents/itms/bin/iTMSTransporter -m provider -u APPLE_DEV_ACCOUNT -p APP_PASSWORD
```

Alternatively, with older versions of Xcode, run:
```sh
/Applications/Xcode.app/Contents/Applications/Application Loader.app/Contents/itms/bin/iTMSTransporter -m provider -u APPLE_DEV_ACCOUNT -p APP_PASSWORD
```

## Notes on your teamId

If you use the new Notary Tool method with `appleId`/`appleIdPassword` you will need to set the `teamId` option. To get this ID, go to your [Apple Developer Account](https://developer.apple.com/account), then click on "Membership details", and there you will find your Team ID. This link should get you there directly: https://developer.apple.com/account#MembershipDetailsCard

## Debug

[`debug`](https://www.npmjs.com/package/debug) is used to display logs and messages. You can use `export DEBUG=electron-notarize*` to log additional debug information from this module.

## Example Usage

```javascript
import { notarize } from '@electron/notarize';

async function packageTask () {
  // Package your app here, and code sign with hardened runtime
  await notarize({
    appBundleId,
    appPath,
    appleId,
    appleIdPassword,
    ascProvider, // This parameter is optional
  });
}
```
