# Homebrew cask for Beacon. `version` + `sha256` are auto-managed on each stable
# release by .github/workflows/homebrew-cask.yml (via scripts/update-cask.mjs);
# edit those two lines by hand only as a fallback. Install with:
#   brew tap andyshinn/beacon https://github.com/andyshinn/beacon
#   brew install --cask beacon
cask "beacon" do
  version "0.1.1"
  sha256 "7d931266e7bd1353d14b324562e559c1a4be15fcb907790e9558ed8feadeb895"

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
    "~/Library/Caches/as.andyshinn.beacon",
    "~/Library/Caches/as.andyshinn.beacon.ShipIt",
    "~/Library/Preferences/as.andyshinn.beacon.plist",
    "~/Library/Saved Application State/as.andyshinn.beacon.savedState",
  ]
end
