import UIKit
import WebKit

/// Full-screen sol.new shell — every product surface works here.
/// External schemes (solana:, mailto:, tel:) hand off to the system.
final class ClipWebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let startURL: URL
    private lazy var webView: WKWebView = {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.websiteDataStore = .default() // localStorage / cookies / passkey-related state
        if #available(iOS 14.0, *) {
            config.limitsNavigationsToAppBoundDomains = false
        }
        let page = WKWebpagePreferences()
        page.allowsContentJavaScript = true
        config.defaultWebpagePreferences = page

        // Feature flags for the web app
        let js = WKUserScript(
            source: """
            window.__SOLNEW_NATIVE__=true;
            window.__SOLNEW_APPCLIP__=true;
            window.__SOLNEW_FULL_PRODUCT__=true;
            try{document.documentElement.dataset.solnewAppclip='1';}catch(e){}
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(js)

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.translatesAutoresizingMaskIntoConstraints = false
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.scrollView.contentInsetAdjustmentBehavior = .automatic
        wv.scrollView.bounces = true
        if #available(iOS 16.4, *) { wv.isInspectable = true }
        return wv
    }()

    private lazy var spinner: UIActivityIndicatorView = {
        let s = UIActivityIndicatorView(style: .large)
        s.color = UIColor(red: 0.66, green: 0.33, blue: 0.97, alpha: 1)
        s.translatesAutoresizingMaskIntoConstraints = false
        s.hidesWhenStopped = true
        return s
    }()

    private lazy var nfcButton: UIButton = {
        var config = UIButton.Configuration.filled()
        config.title = nil
        config.image = UIImage(systemName: "wave.3.right")
        config.cornerStyle = .capsule
        config.baseBackgroundColor = UIColor(red: 0.66, green: 0.33, blue: 0.97, alpha: 0.92)
        config.baseForegroundColor = .white
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12)
        let b = UIButton(configuration: config)
        b.translatesAutoresizingMaskIntoConstraints = false
        b.accessibilityLabel = "Scan NFC"
        b.addTarget(self, action: #selector(scanNFC), for: .touchUpInside)
        // Core NFC NDEF entitlement removed for App Store (SDK 26). System still
        // opens the Clip from NFC URL tags; in-Clip scan is optional/unavailable.
        b.isHidden = true
        return b
    }()

    init(startURL: URL) {
        self.startURL = startURL
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        view.addSubview(webView)
        view.addSubview(spinner)
        view.addSubview(nfcButton)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            nfcButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            nfcButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -72),
            nfcButton.widthAnchor.constraint(equalToConstant: 48),
            nfcButton.heightAnchor.constraint(equalToConstant: 48),
        ])

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        load(startURL)
    }

    @objc private func pullRefresh() {
        webView.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.webView.scrollView.refreshControl?.endRefreshing()
        }
    }

    @objc private func scanNFC() {
        ClipNFCReader.shared.scan(
            onURL: { [weak self] url in
                guard let self else { return }
                if Self.isSolNew(url) {
                    self.load(Self.withAppClipSource(url))
                } else {
                    UIApplication.shared.open(url)
                }
            },
            onMessage: { [weak self] msg in
                let alert = UIAlertController(title: "NFC", message: msg, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                self?.present(alert, animated: true)
            }
        )
    }

    func load(_ url: URL) {
        spinner.startAnimating()
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let scheme = (url.scheme ?? "").lowercased()

        // Custom / external schemes → system (wallets, mail, phone, sms)
        let handoffSchemes: Set<String> = [
            "solana", "phantom", "solflare", "mailto", "tel", "sms", "facetime", "maps", "itms-apps",
        ]
        if handoffSchemes.contains(scheme) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
            return
        }

        // Full sol.new product stays inside the Clip
        if Self.isSolNew(url) || scheme == "about" || scheme == "blob" || scheme.isEmpty {
            decisionHandler(.allow)
            return
        }

        // http(s) off-domain: open outside so Clip stays under size / policy
        if scheme == "http" || scheme == "https" {
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }

        decisionHandler(.allow)
    }

    // target=_blank / window.open
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            if Self.isSolNew(url) {
                load(url)
            } else {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    // MARK: - Helpers

    private static func isSolNew(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "sol.new" || host == "www.sol.new" || host.hasSuffix(".sol.new")
    }

    private static func withAppClipSource(_ url: URL) -> URL {
        guard var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        var items = comps.queryItems ?? []
        if !items.contains(where: { $0.name == "source" }) {
            items.append(URLQueryItem(name: "source", value: "appclip"))
            comps.queryItems = items
        }
        return comps.url ?? url
    }
}
