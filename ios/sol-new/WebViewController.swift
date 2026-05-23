import UIKit
import WebKit
import UserNotifications

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    private static let homeURL = URL(string: "https://sol.new/?source=ios")!
    private static let host = "sol.new"

    private lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        let pagePrefs = WKWebpagePreferences()
        pagePrefs.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = pagePrefs

        // Signal native context and register bridge for push notifications
        let script = WKUserScript(
            source: "window.__SOLNEW_NATIVE__ = true; localStorage.setItem('solnew_native', '1');",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(script)
        configuration.userContentController.add(self, name: "notifications")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = true
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        return webView
    }()

    private lazy var refreshControl: UIRefreshControl = {
        let control = UIRefreshControl()
        control.tintColor = UIColor(red: 0.66, green: 0.33, blue: 0.97, alpha: 1.0)
        control.addTarget(self, action: #selector(reloadFromTop), for: .valueChanged)
        return control
    }()

    private lazy var splashView: UIView = makeSplash()

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        view.addSubview(webView)
        webView.scrollView.refreshControl = refreshControl

        // Listen for APNs token and notification taps from AppDelegate
        NotificationCenter.default.addObserver(self, selector: #selector(handleApnsToken(_:)), name: .apnsTokenReceived, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleNotificationTap(_:)), name: .notificationTapped, object: nil)

        view.addSubview(splashView)
        splashView.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            splashView.topAnchor.constraint(equalTo: view.topAnchor),
            splashView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splashView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            splashView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        webView.load(URLRequest(url: Self.homeURL))
    }

    func handleIncomingURL(_ url: URL) {
        let target: URL
        if url.host == Self.host {
            target = url
        } else if url.scheme == "solnew" {
            // solnew://path → https://sol.new/path
            var components = URLComponents()
            components.scheme = "https"
            components.host = Self.host
            components.path = url.path.isEmpty ? "/" : url.path
            components.query = url.query
            target = components.url ?? Self.homeURL
        } else {
            return
        }
        webView.load(URLRequest(url: target))
    }

    @objc private func reloadFromTop() {
        webView.reload()
    }

    // MARK: WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow); return
        }

        // Keep sol.new and its subdomains in the app.
        if let host = url.host,
           host == Self.host || host.hasSuffix(".\(Self.host)") {
            decisionHandler(.allow); return
        }

        // tel:, mailto:, sms:, and known wallet schemes go to the system.
        let externalSchemes: Set<String> = ["tel", "mailto", "sms", "solana", "phantom", "solflare", "itms-apps"]
        if let scheme = url.scheme?.lowercased(), externalSchemes.contains(scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel); return
        }

        // All other http/https links open in Safari — native app doesn't need an in-app browser.
        if url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel); return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshControl.endRefreshing()
        UIView.animate(withDuration: 0.25, delay: 0.05, options: [.curveEaseOut]) {
            self.splashView.alpha = 0
        } completion: { _ in
            self.splashView.isHidden = true
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
    }

    // MARK: WKUIDelegate — target=_blank handling

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            if let host = url.host, host == Self.host || host.hasSuffix(".\(Self.host)") {
                webView.load(navigationAction.request)
            } else if url.scheme == "http" || url.scheme == "https" {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    // MARK: WKScriptMessageHandler — JS → Swift bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "notifications",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        if action == "requestPermission" {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                DispatchQueue.main.async {
                    if granted {
                        UIApplication.shared.registerForRemoteNotifications()
                    } else {
                        // Tell the web app permission was denied
                        self.webView.evaluateJavaScript(
                            "window.postMessage({ type: 'apns-denied' }, '*');"
                        )
                    }
                }
            }
        }
    }

    // MARK: APNs token bridge

    @objc private func handleApnsToken(_ note: Notification) {
        guard let token = note.object as? String else {
            webView.evaluateJavaScript("window.postMessage({ type: 'apns-denied' }, '*');")
            return
        }
        let js = "window.__SOLNEW_PUSH_GRANTED__ = true; window.postMessage({ type: 'apns-token', token: '\(token)' }, '*');"
        webView.evaluateJavaScript(js)
    }

    @objc private func handleNotificationTap(_ note: Notification) {
        guard let url = note.object as? URL else { return }
        let js = "window.location.href = '\(url.absoluteString)';"
        webView.evaluateJavaScript(js)
    }

    // MARK: Splash

    private func makeSplash() -> UIView {
        let container = UIView()
        container.backgroundColor = .black

        let logo = UIImageView(image: UIImage(named: "AppIcon"))
        logo.contentMode = .scaleAspectFit
        logo.layer.cornerRadius = 24
        logo.layer.cornerCurve = .continuous
        logo.clipsToBounds = true
        logo.translatesAutoresizingMaskIntoConstraints = false

        // Fallback render when the asset image isn't available at runtime.
        if logo.image == nil {
            let fallback = UILabel()
            fallback.text = "sol.new"
            fallback.font = .systemFont(ofSize: 36, weight: .bold)
            fallback.textColor = UIColor(red: 0.66, green: 0.33, blue: 0.97, alpha: 1.0)
            fallback.textAlignment = .center
            fallback.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(fallback)
            NSLayoutConstraint.activate([
                fallback.centerXAnchor.constraint(equalTo: container.centerXAnchor),
                fallback.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            ])
        } else {
            container.addSubview(logo)
            NSLayoutConstraint.activate([
                logo.centerXAnchor.constraint(equalTo: container.centerXAnchor),
                logo.centerYAnchor.constraint(equalTo: container.centerYAnchor),
                logo.widthAnchor.constraint(equalToConstant: 96),
                logo.heightAnchor.constraint(equalToConstant: 96),
            ])
        }

        return container
    }
}
