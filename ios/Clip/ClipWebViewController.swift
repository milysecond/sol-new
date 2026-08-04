import UIKit
import WebKit

/// Single-screen WebView for the App Clip (keeps binary tiny).
final class ClipWebViewController: UIViewController, WKNavigationDelegate {
    private let startURL: URL
    private lazy var webView: WKWebView = {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let page = WKWebpagePreferences()
        page.allowsContentJavaScript = true
        config.defaultWebpagePreferences = page
        let js = WKUserScript(
            source: "window.__SOLNEW_NATIVE__=true;window.__SOLNEW_APPCLIP__=true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(js)
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.translatesAutoresizingMaskIntoConstraints = false
        wv.navigationDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.scrollView.contentInsetAdjustmentBehavior = .never
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
        config.title = "Scan NFC"
        config.image = UIImage(systemName: "wave.3.right")
        config.imagePadding = 8
        config.cornerStyle = .capsule
        config.baseBackgroundColor = UIColor(red: 0.66, green: 0.33, blue: 0.97, alpha: 0.95)
        config.baseForegroundColor = .white
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 18, bottom: 12, trailing: 18)
        let b = UIButton(configuration: config)
        b.translatesAutoresizingMaskIntoConstraints = false
        b.addTarget(self, action: #selector(scanNFC), for: .touchUpInside)
        b.isHidden = !ClipNFCReader.shared.isAvailable
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
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            nfcButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            nfcButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
        ])
        load(startURL)
    }

    @objc private func scanNFC() {
        ClipNFCReader.shared.scan(
            onURL: { [weak self] url in
                guard let self else { return }
                if let host = url.host?.lowercased(),
                   host == "sol.new" || host == "www.sol.new" || host.hasSuffix(".sol.new") {
                    self.load(url)
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
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
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
        // Keep sol.new inside the clip; hand off everything else
        if let host = url.host?.lowercased(),
           host == "sol.new" || host == "www.sol.new" || host.hasSuffix(".sol.new") {
            decisionHandler(.allow)
            return
        }
        if navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}
