#include <unistd.h>
#include <stdlib.h>
#include <libgen.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>

int main(int argc, char *argv[]) {
    // Prevent Electron from running in Node CLI mode if inherited from IDE or environment
    unsetenv("ELECTRON_RUN_AS_NODE");

    char path[PATH_MAX];
    uint32_t size = sizeof(path);
    if (_NSGetExecutablePath(path, &size) == 0) {
        char *dir = dirname(path);
        char electron_path[PATH_MAX];
        snprintf(electron_path, sizeof(electron_path), "%s/Electron", dir);
        execv(electron_path, argv);
    }

    perror("execv failed to launch Electron");
    return 1;
}
