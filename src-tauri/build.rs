fn main() {
    // sherpa-rs-sys copies the sherpa-onnx + onnxruntime dylibs next to the
    // built executable, but it does not emit an rpath (see the `// TODO: add
    // rpath` in its build.rs). The dylibs are referenced as
    // `@rpath/libonnxruntime.1.17.1.dylib` / `@rpath/libsherpa-onnx-c-api.dylib`,
    // so without an rpath dyld can't find them and the app aborts at launch with
    // "Library not loaded ... no LC_RPATH's found".
    //
    // Add the two rpaths the binary needs:
    //   - @executable_path             -> `cargo run` / `tauri dev`: dylibs sit
    //                                      next to the exe in target/<profile>/
    //   - @executable_path/../Frameworks -> packaged .app: dylibs are bundled
    //                                      into Contents/Frameworks/ (see the
    //                                      `bundle.macOS.frameworks` list in
    //                                      tauri.conf.json)
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,@executable_path");
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,@executable_path/../Frameworks");
    }

    tauri_build::build()
}
