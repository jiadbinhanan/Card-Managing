const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

function patchAarFile(aarPath) {
  try {
    if (process.platform === 'win32') {
      const escapedAar = aarPath.replace(/'/g, "''");
      const psCommand = `Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::Open('${escapedAar}', [System.IO.Compression.ZipArchiveMode]::Update); $e = $zip.Entries | Where-Object { $_.FullName -like '*graphicsConversions.h*' }; if ($e) { $r = New-Object System.IO.StreamReader($e.Open()); $c = $r.ReadToEnd(); $r.Close(); if ($c.Contains('std::format')) { $nc = $c.Replace('return std::format("{}%", dimension.value);', 'return std::to_string(dimension.value) + "%";'); $fn = $e.FullName; $e.Delete(); $ne = $zip.CreateEntry($fn); $w = New-Object System.IO.StreamWriter($ne.Open()); $w.Write($nc); $w.Close(); Write-Output 'AAR_PATCHED' } }; $zip.Dispose()`;
      const out = child_process.execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      if (out && out.includes('AAR_PATCHED')) {
        console.log('[patch-rn-cpp] Patched graphicsConversions.h inside AAR:', aarPath);
      }
    } else {
      const tmpDir = path.join(os.tmpdir(), 'aar_patch_' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        child_process.execSync(`unzip -q -o "${aarPath}" "prefab/modules/reactnative/include/react/renderer/core/graphicsConversions.h" -d "${tmpDir}"`, { stdio: 'ignore' });
        const extracted = path.join(tmpDir, 'prefab/modules/reactnative/include/react/renderer/core/graphicsConversions.h');
        if (fs.existsSync(extracted)) {
          let content = fs.readFileSync(extracted, 'utf8');
          if (content.includes('std::format')) {
            content = content.replace(/return\s+std::format\s*\(\s*["']\{\}%["']\s*,\s*dimension\.value\s*\)\s*;/g, 'return std::to_string(dimension.value) + "%";');
            content = content.replace('return std::format("{}%", dimension.value);', 'return std::to_string(dimension.value) + "%";');
            fs.writeFileSync(extracted, content, 'utf8');
            child_process.execSync(`cd "${tmpDir}" && zip -u "${aarPath}" "prefab/modules/reactnative/include/react/renderer/core/graphicsConversions.h"`, { stdio: 'ignore' });
            console.log('[patch-rn-cpp] Patched graphicsConversions.h inside AAR on Linux:', aarPath);
          }
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } catch (err) {
    // Non-fatal if AAR is locked or in use
  }
}

function findTransformPath() {
  const baseTransforms = path.join(os.homedir(), '.gradle', 'caches');
  if (!fs.existsSync(baseTransforms)) return '';
  
  try {
    for (const v of fs.readdirSync(baseTransforms)) {
      const tDir = path.join(baseTransforms, v, 'transforms');
      if (fs.existsSync(tDir)) {
        for (const t of fs.readdirSync(tDir)) {
          const transformedDir = path.join(tDir, t, 'transformed');
          if (fs.existsSync(transformedDir)) {
            for (const cand of fs.readdirSync(transformedDir)) {
              if (cand.startsWith('react-android-0.86.3')) {
                return path.join(transformedDir, cand).replace(/\\/g, '/');
              }
            }
          }
        }
      }
    }
  } catch (e) {}
  return '';
}

const cachedTransformPath = findTransformPath();

function provisionReactAndroidConfig(targetCmakeDir, abiName) {
  const reactAndroidDir = path.join(targetCmakeDir, 'ReactAndroid');
  if (fs.existsSync(reactAndroidDir)) return;
  if (!cachedTransformPath) return;

  fs.mkdirSync(reactAndroidDir, { recursive: true });
  const configPath = path.join(reactAndroidDir, 'ReactAndroidConfig.cmake');
  const versionPath = path.join(reactAndroidDir, 'ReactAndroidConfigVersion.cmake');
  
  fs.writeFileSync(configPath, `if(NOT TARGET ReactAndroid::hermestooling)
add_library(ReactAndroid::hermestooling SHARED IMPORTED)
set_target_properties(ReactAndroid::hermestooling PROPERTIES
    IMPORTED_LOCATION "${cachedTransformPath}/prefab/modules/hermestooling/libs/android.${abiName}/libhermestooling.so"
    INTERFACE_INCLUDE_DIRECTORIES "${cachedTransformPath}/prefab/modules/hermestooling/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::jsi)
add_library(ReactAndroid::jsi SHARED IMPORTED)
set_target_properties(ReactAndroid::jsi PROPERTIES
    IMPORTED_LOCATION "${cachedTransformPath}/prefab/modules/jsi/libs/android.${abiName}/libjsi.so"
    INTERFACE_INCLUDE_DIRECTORIES "${cachedTransformPath}/prefab/modules/jsi/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

if(NOT TARGET ReactAndroid::reactnative)
add_library(ReactAndroid::reactnative SHARED IMPORTED)
set_target_properties(ReactAndroid::reactnative PROPERTIES
    IMPORTED_LOCATION "${cachedTransformPath}/prefab/modules/reactnative/libs/android.${abiName}/libreactnative.so"
    INTERFACE_INCLUDE_DIRECTORIES "${cachedTransformPath}/prefab/modules/reactnative/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()
`, 'utf8');

  fs.writeFileSync(versionPath, `set(PACKAGE_VERSION 0.86.3)
if("\${PACKAGE_VERSION}" VERSION_LESS "\${PACKAGE_FIND_VERSION}")
    set(PACKAGE_VERSION_COMPATIBLE FALSE)
else()
    set(PACKAGE_VERSION_COMPATIBLE TRUE)
    if("\${PACKAGE_VERSION}" VERSION_EQUAL "\${PACKAGE_FIND_VERSION}")
        set(PACKAGE_VERSION_EXACT TRUE)
    endif()
endif()
`, 'utf8');
  console.log('[patch-rn-cpp] Provisioned ReactAndroidConfig in:', reactAndroidDir, 'for', abiName);
}

function patchGraphicsHeader(headerPath) {
  if (!fs.existsSync(headerPath)) return;
  try {
    let content = fs.readFileSync(headerPath, 'utf8');
    if (content.includes('std::format')) {
      content = content.replace(
        /return\s+std::format\s*\(\s*["']\{\}%["']\s*,\s*dimension\.value\s*\)\s*;/g,
        'return std::to_string(dimension.value) + "%";'
      );
      content = content.replace(
        'return std::format("{}%", dimension.value);',
        'return std::to_string(dimension.value) + "%";'
      );
      fs.writeFileSync(headerPath, content, 'utf8');
      console.log('[patch-rn-cpp] Successfully patched graphicsConversions.h:', headerPath);
    }
  } catch (e) {
    console.error('[patch-rn-cpp] Error patching:', headerPath, e.message);
  }
}

function patchReanimatedDir(dir) {
  if (!fs.existsSync(dir)) return;

  const cppFile = path.join(dir, 'TransformOperationInterpolator.cpp');
  if (fs.existsSync(cppFile)) {
    try {
      let content = fs.readFileSync(cppFile, 'utf8');
      if (content.includes('// Specialization for resolvable operations')) {
        content = content.replace(
          /\/\/ Specialization for resolvable operations[\s\S]*?\/\/ Rotate operations/,
          '// Rotate operations'
        );
        fs.writeFileSync(cppFile, content, 'utf8');
        console.log('[patch-rn-cpp] Patched TransformOperationInterpolator.cpp in:', dir);
      }
    } catch (e) {}
  }

  const hFile = path.join(dir, 'TransformOperationInterpolator.h');
  if (fs.existsSync(hFile)) {
    try {
      let content = fs.readFileSync(hFile, 'utf8');
      if (!content.includes('fromOp.value.interpolate')) {
        const regex = /template\s*<ResolvableOp\s+TOperation>\s*class\s+TransformOperationInterpolator<TOperation>[\s\S]*?};\s*(?=\}\s*\/\/\s*namespace\s+reanimated::css)/;
        const replacement = `template <ResolvableOp TOperation>
class TransformOperationInterpolator<TOperation> : public StyleOperationInterpolator {
 public:
  TransformOperationInterpolator(
      const std::shared_ptr<TOperation> &defaultOperation,
      ResolvableValueInterpolatorConfig config)
      : StyleOperationInterpolator(defaultOperation), config_(std::move(config)) {}

  std::unique_ptr<StyleOperation> interpolate(
      double progress,
      const std::shared_ptr<StyleOperation> &from,
      const std::shared_ptr<StyleOperation> &to,
      const StyleOperationsInterpolationContext &context) const override {
    const auto &fromOp = *std::static_pointer_cast<TOperation>(from);
    const auto &toOp = *std::static_pointer_cast<TOperation>(to);

    return std::make_unique<TOperation>(
        fromOp.value.interpolate(progress, toOp.value, getResolvableValueContext(context)));
  }

  std::shared_ptr<StyleOperation> resolveOperation(
      const std::shared_ptr<StyleOperation> &operation,
      const StyleOperationsInterpolationContext &context) const override {
    const auto &resolvableOp = std::static_pointer_cast<TOperation>(operation);
    const auto &resolved = resolvableOp->value.resolve(getResolvableValueContext(context));

    if (!resolved.has_value()) {
      throw std::invalid_argument(
          "[Reanimated] Cannot resolve resolvable operation: " + operation->getOperationName() +
          " for node with tag: " + std::to_string(context.node->getTag()));
    }

    return std::make_shared<TOperation>(resolved.value());
  }

  protected:
  const ResolvableValueInterpolatorConfig config_;

  ResolvableValueInterpolationContext getResolvableValueContext(
      const StyleOperationsInterpolationContext &context) const {
    return ResolvableValueInterpolationContext{
        .node = context.node,
        .fallbackInterpolateThreshold = context.fallbackInterpolateThreshold,
        .viewStylesRepository = context.viewStylesRepository,
        .relativeProperty = config_.relativeProperty,
        .relativeTo = config_.relativeTo};
  }
};`;
        if (regex.test(content)) {
          content = content.replace(regex, replacement);
          fs.writeFileSync(hFile, content, 'utf8');
          console.log('[patch-rn-cpp] Patched TransformOperationInterpolator.h in:', dir);
        }
      }
    } catch (e) {}
  }
}

function patchReanimatedInterpolator(nodeModulesDir) {
  const directDir = path.join(
    nodeModulesDir,
    'react-native-reanimated',
    'Common',
    'cpp',
    'reanimated',
    'CSS',
    'interpolation',
    'transforms'
  );
  patchReanimatedDir(directDir);

  // Also scan for any nested/hoisted/pnpm reanimated dirs
  function scanForReanimated(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.name === 'transforms' && full.includes('reanimated') && full.includes('interpolation')) {
          patchReanimatedDir(full);
        } else if (entry.name !== 'node_modules' || dir === nodeModulesDir) {
          scanForReanimated(full);
        }
      }
    } catch (e) {}
  }

  scanForReanimated(nodeModulesDir);
}

function patchSubprojectBuildGradles(nodeModulesDir) {
  const pkgs = [
    '@react-native-async-storage/async-storage',
    '@react-native-community/netinfo',
    '@react-native-masked-view/masked-view',
    'react-native-gesture-handler',
    'react-native-mmkv',
    'react-native-nitro-modules',
    'react-native-safe-area-context',
    'react-native-screens',
    'react-native-svg',
    'react-native-worklets'
  ];

  for (const pkg of pkgs) {
    const bgPath = path.join(nodeModulesDir, ...pkg.split('/'), 'android', 'build.gradle');
    if (fs.existsSync(bgPath)) {
      try {
        let content = fs.readFileSync(bgPath, 'utf8');
        if (content.includes('com.facebook.react:react-native:+')) {
          content = content.replace(/['"]com\.facebook\.react:react-native:\+['"]/g, "'com.facebook.react:react-android'");
          fs.writeFileSync(bgPath, content, 'utf8');
          console.log('[patch-rn-cpp] Patched react-android dependency in:', pkg);
        }
      } catch (e) {}
    }
  }
}

function scanAndProvisionPrefab(rootDir) {
  if (!fs.existsSync(rootDir)) return;
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(rootDir, e.name);
      if (e.isDirectory() && e.name !== '.git') {
        if (e.name === 'cmake' && full.includes('prefab')) {
          if (full.includes('aarch64-linux-android')) {
            provisionReactAndroidConfig(full, 'arm64-v8a');
          } else if (full.includes('x86_64-linux-android')) {
            provisionReactAndroidConfig(full, 'x86_64');
          }
        } else {
          scanAndProvisionPrefab(full);
        }
      }
    }
  } catch (e) {}
}

function findAndPatchAllGraphics(dir) {
  if (!fs.existsSync(dir)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    try {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name !== '.git') {
          findAndPatchAllGraphics(full);
        }
      } else if (ent.name === 'graphicsConversions.h') {
        patchGraphicsHeader(full);
      }
    } catch (e) {}
  }
}

function provisionHermesc() {
  const rootDir = path.resolve(__dirname, '..');
  let hermesCompilerDir = path.join(rootDir, 'node_modules', 'hermes-compiler', 'hermesc');
  if (!fs.existsSync(hermesCompilerDir)) {
    try {
      const pkgPath = require.resolve('hermes-compiler/package.json');
      hermesCompilerDir = path.join(path.dirname(pkgPath), 'hermesc');
    } catch (e) {}
  }

  if (fs.existsSync(hermesCompilerDir)) {
    const targetDirs = [
      path.join(rootDir, 'node_modules', 'react-native', 'sdks', 'hermesc'),
      path.join(rootDir, 'apps', 'mobile', 'node_modules', 'react-native', 'sdks', 'hermesc'),
      path.join(rootDir, 'apps', 'mobile', 'node_modules', 'hermes-compiler', 'hermesc')
    ];

    for (const targetDir of targetDirs) {
      try {
        const parentPkg = path.dirname(path.dirname(targetDir));
        if (fs.existsSync(parentPkg)) {
          fs.mkdirSync(path.dirname(targetDir), { recursive: true });
          if (!fs.existsSync(targetDir)) {
            fs.cpSync(hermesCompilerDir, targetDir, { recursive: true });
            console.log('[patch-rn-cpp] Provisioned hermesc to:', targetDir);
          }
        }
      } catch (e) {
        console.error('[patch-rn-cpp] Could not provision hermesc to:', targetDir, e.message);
      }
    }

    if (process.platform !== 'win32') {
      try {
        child_process.execSync(`chmod -R +x "${hermesCompilerDir}"`, { stdio: 'ignore' });
        for (const targetDir of targetDirs) {
          if (fs.existsSync(targetDir)) {
            child_process.execSync(`chmod -R +x "${targetDir}"`, { stdio: 'ignore' });
          }
        }
      } catch (e) {}
    }
  }
}

// 1. Patch node_modules
const rootDir = path.resolve(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');

provisionHermesc();
findAndPatchAllGraphics(nodeModulesDir);
findAndPatchAllGraphics(path.join(rootDir, 'apps', 'mobile', 'node_modules'));
findAndPatchAllGraphics(path.join(rootDir, 'apps', 'mobile', 'android'));
patchReanimatedInterpolator(nodeModulesDir);
patchSubprojectBuildGradles(nodeModulesDir);

// 2. Patch .aar file in Gradle cache
const aarDir = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'com.facebook.react', 'react-android');
if (fs.existsSync(aarDir)) {
  try {
    function findAars(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) findAars(full);
        else if (ent.name.endsWith('.aar') && ent.name.includes('0.86.3')) {
          patchAarFile(full);
        }
      }
    }
    findAars(aarDir);
  } catch (e) {}
}

// 3. Patch all extracted transforms and headers in ~/.gradle/caches and /home/runner/.gradle/caches
const gradleCandidates = [
  path.join(os.homedir(), '.gradle', 'caches'),
  '/home/runner/.gradle/caches'
];
for (const gDir of gradleCandidates) {
  if (fs.existsSync(gDir)) {
    findAndPatchAllGraphics(gDir);
  }
}

// 4. Provision prefab ReactAndroidConfig in all .cxx dirs
scanAndProvisionPrefab(path.join(rootDir, 'apps', 'mobile', 'android', 'app', '.cxx'));
if (fs.existsSync(nodeModulesDir)) {
  for (const ent of fs.readdirSync(nodeModulesDir)) {
    const cxxDir = path.join(nodeModulesDir, ent, 'android', '.cxx');
    if (fs.existsSync(cxxDir)) {
      scanAndProvisionPrefab(cxxDir);
    }
  }
}

console.log('[patch-rn-cpp] Done.');
