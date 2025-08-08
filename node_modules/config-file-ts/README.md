## config-file-ts
*Just use TypeScript for configuration files.*
####

TypeScript is more syntactically **flexible** than JSON. Comments are allowed. Keys needn't be quoted. 
Arrays can have trailing commas.

TypeScript allows a little **programming** in config files. Share variables, use utility functions, etc.

TypeScript **types** provide free error checking, and free IDE support for getting config files right.

### Fast
Parsing TypeScript config files is plenty quick. config-file-ts caches the TypeScript output. 

Assuming TypeScript is in your environment, config-file-ts adds about 5kb to your program, or 1.5kb minified.
### How to use
```bash
$ yarn add config-file-ts
```

In the config file, export default. ```my.config.ts```:
```ts
export default {
  entry: "my stuff" // comments are welcome now
};
````


Feel free to add types and scripting. ```my.config.ts```:
```ts
import os from "os";			      // use installed libraries in the config
import { MyConfig } from "./MyProgram";

export default {
  entry: `${os.userInfo().username}'s stuff`  // use scripting in the config file
} as MyConfig;                                // typecheck the config file
````

Read the config file in your program. ```MyProgram.ts```:
```ts
export interface MyConfig {
  entry?: string;
}

const config = loadTsConfig<MyConfig>("my.config.ts");
```
