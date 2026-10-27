Pod::Spec.new do |s|
  s.name = 'MolfarLink'
  s.version = '0.1.0'
  s.summary = 'MOLFAR direct QUIC connection'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'MOLFAR'
  s.homepage = 'https://usemono.dev'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/deluminor/molfar.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.resource_bundles = { 'MolfarTranscriptAssets' => ['Resources/transcript-artwork.json'] }
  s.vendored_frameworks = 'MolfarLinkCore.xcframework'
  s.frameworks = 'Security', 'SystemConfiguration', 'UIKit', 'CoreText'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
