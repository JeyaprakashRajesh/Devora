# Windows Development Dependencies

To contribute to the Devora platform on Windows, we **highly recommend** using WSL 2 (Windows Subsystem for Linux), but a native setup is also possible. Below are the steps for setting up a Windows environment using native tools + Docker Desktop.

## 1. Git for Windows
Install Git to clone the repository and execute version control commands.
- Download and install from [Git for Windows](https://gitforwindows.org/).

## 2. Node.js 20 LTS & npm
We recommend using **fnm** (Fast Node Manager) or **nvm-windows** to manage Node.js versions.

Using `winget` (Windows Package Manager) to install fnm:
```powershell
winget install Schniz.fnm
```
Then, install Node 20 LTS:
```powershell
fnm env --use-on-cd | Out-String | Invoke-Expression
fnm use --install-if-missing 20
```

## 3. Visual Studio Build Tools (C++ Workload)
Required for building native Node.js modules and Rust crates.

1. Download the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
2. Run the installer and select the **Desktop development with C++** workload.
3. Ensure the Windows SDK and MSVC C++ build tools are checked on the right panel.
4. Click Install.

## 4. Rust 1.78+
Rust is required to work on the `deploy-engine` and `installer` in the `core/` directory.

1. Download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/).
2. Follow the prompt to install the default MSVC toolchain.
3. Verify the installation in a new terminal:
```powershell
rustc --version
```

## 5. Docker Desktop
Docker is required for spinning up the local development infrastructure (PostgreSQL, NATS, etc.).

1. Ensure **WSL2** is enabled on your machine. Open PowerShell as Administrator and run:
   ```powershell
   wsl --install
   ```
2. Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
3. Follow the installation wizard and ensure "Use WSL 2 instead of Hyper-V" is checked.
4. Open Docker Desktop after installation to start the Docker daemon.

---

## Recommendation: WSL 2 (Ubuntu)
Since the production environment targets Linux, many developers prefer running their code inside WSL 2. If you choose this route:
1. Install Ubuntu via WSL (`wsl --install -d Ubuntu`).
2. Follow the [Linux Development Dependencies](./linux_dependencies.md) inside your Ubuntu WSL instance.
3. Use the WSL Integration feature in Docker Desktop to make Docker accessible inside Ubuntu.
4. Use VS Code with the "WSL" extension to code seamlessly.
