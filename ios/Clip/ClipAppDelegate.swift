import UIKit
import WebKit

/// Minimal App Clip: full-screen WKWebView → sol.new (or invocation URL).
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

    private static let fallback = URL(string: "https://sol.new/?source=appclip")!

    private static func initialURL(from launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> URL {
        if let activity = launchOptions?[.userActivityDictionary] as? [AnyHashable: Any] {
            for value in activity.values {
                if let ua = value as? NSUserActivity, let url = url(from: ua) {
                    return url
                }
            }
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
