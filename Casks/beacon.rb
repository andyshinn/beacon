# Homebrew cask for Beacon. `version` + `sha256` are auto-managed on each stable
# release by .github/workflows/homebrew-cask.yml (via scripts/update-cask.mjs);
# edit those two lines by hand only as a fallback. Install with:
#   brew tap andyshinn/beacon https://github.com/andyshinn/beacon
#   brew install --cask beacon
cask "beacon" do
  version "0.1.0"
  sha256 "a76348b4d8b3c552948e88c3a63b0c026c796063a80133ba68dcaf80b8a6f5b2"

  url "https://github.com/andyshinn/beacon/releases/download/v#{version}/Beacon-#{version}-universal.dmg"
  name "Beacon"
  desc "Browser for mDNS / Bonjour / DNS-SD service discovery"
  homepage "https://github.com/andyshinn/beacon"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :big_sur

  app "Beacon.app"

  zap trash: [
    "~/Library/Application Support/Beacon",
    "~/Library/Caches/com.andyshinn.beacon",
    "~/Library/Caches/com.andyshinn.beacon.ShipIt",
    "~/Library/Preferences/com.andyshinn.beacon.plist",
    "~/Library/Saved Application State/com.andyshinn.beacon.savedState",
  ]
end
