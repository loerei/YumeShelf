#include <windows.h>
#include <stdio.h>
#include <tlhelp32.h>

int main(int argc, char* argv[]) {
    if (argc < 3) {
        printf("Usage: injector.exe <PID> <PathToDLL>\n");
        return 1;
    }

    DWORD processId = (DWORD)atoi(argv[1]);
    const char* dllPath = argv[2];

    HANDLE hProcess = OpenProcess(PROCESS_ALL_ACCESS, FALSE, processId);
    if (hProcess == NULL) {
        printf("Failed to open process. Error: %lu\n", GetLastError());
        return 1;
    }

    LPVOID pDllPath = VirtualAllocEx(hProcess, 0, strlen(dllPath) + 1, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (pDllPath == NULL) {
        printf("Failed to allocate memory in target process. Error: %lu\n", GetLastError());
        CloseHandle(hProcess);
        return 1;
    }

    if (!WriteProcessMemory(hProcess, pDllPath, (LPVOID)dllPath, strlen(dllPath) + 1, NULL)) {
        printf("Failed to write memory in target process. Error: %lu\n", GetLastError());
        VirtualFreeEx(hProcess, pDllPath, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }

    HMODULE hKernel32 = GetModuleHandleA("Kernel32.dll");
    if (hKernel32 == NULL) {
        printf("Failed to get Kernel32 module handle. Error: %lu\n", GetLastError());
        VirtualFreeEx(hProcess, pDllPath, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }

    LPVOID pLoadLibrary = (LPVOID)GetProcAddress(hKernel32, "LoadLibraryA");
    if (pLoadLibrary == NULL) {
        printf("Failed to get LoadLibraryA address. Error: %lu\n", GetLastError());
        VirtualFreeEx(hProcess, pDllPath, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }

    HANDLE hThread = CreateRemoteThread(hProcess, NULL, 0, (LPTHREAD_START_ROUTINE)pLoadLibrary, pDllPath, 0, NULL);
    if (hThread == NULL) {
        printf("Failed to create remote thread. Error: %lu\n", GetLastError());
        VirtualFreeEx(hProcess, pDllPath, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return 1;
    }

    WaitForSingleObject(hThread, INFINITE);
    
    // Optional cleanup of the allocated string memory inside the target process
    VirtualFreeEx(hProcess, pDllPath, 0, MEM_RELEASE);
    
    CloseHandle(hThread);
    CloseHandle(hProcess);

    printf("Successfully injected DLL.\n");
    return 0;
}
