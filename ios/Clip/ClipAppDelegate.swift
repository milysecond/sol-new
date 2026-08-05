import UIKit
import WebKit

/// Full-product App Clip: WKWebView shell for anything on sol.new
/// (wallet, swap, gift, POAP, stake…). Invocation URL deep-links in.
@main
final class ClipAppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let start = Self.initialURL(from: launchOptions)
        window.rootViewController = ClipWebViewController(startURL: start)
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard let url = Self.url(from: userActivity),
              let root = window?.rootViewController as? ClipWebViewController
        else { return false }
        root.load(url)
        return true
    }

    /// Cold open with no invocation → full product home (not a limited demo).
    private static let fallback = URL(string: "https://sol.new/home?source=appclip")!

    private static func initialURL(from launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> URL {
        if let activity = launchOptions?[.userActivityDictionary] as? [AnyHashable: Any] {
            for value in activity.values {
                if let ua = value as? NSUserActivity, let url = url(from: ua) {
                    return url
                }
            }
        }
        // Xcode / Local Experience can pass _XCAppClipURL via process info
        if let raw = ProcessInfo.processInfo.environment["_XCAppClipURL"],
           let url = URL(string: raw),
           isAllowed(url) {
            return appendSource(url)
        }
        return fallback
    }

    /// Universal Link / App Clip invocation (NFC or QR → https://sol.new/…)
    private static func url(from activity: NSUserActivity) -> URL? {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = activity.webpageURL,
              isAllowed(url)
        else { return nil }
        return appendSource(url)
    }

    private static func isAllowed(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "sol.new" || host == "www.sol.new" || host.hasSuffix(".sol.new")
    }

    private static func appendSource(_ url: URL) -> URL {
        guard var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        var items = comps.queryItems ?? []
        if !items.contains(where: { $0.name == "source" }) {
            items.append(URLQueryItem(name: "source", value: "appclip"))
            comps.queryItems = items
        }
        return comps.url ?? url
    }
}
