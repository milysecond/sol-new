import CoreNFC
import UIKit

/// Minimal NDEF reader for App Clip / full app.
/// System NFC URL tags still open the Clip without this; this is for in-app scans.
@MainActor
final class ClipNFCReader: NSObject, NFCNDEFReaderSessionDelegate {
    static let shared = ClipNFCReader()

    private var session: NFCNDEFReaderSession?
    private var onURL: ((URL) -> Void)?
    private var onMessage: ((String) -> Void)?

    var isAvailable: Bool { NFCNDEFReaderSession.readingAvailable }

    func scan(onURL: @escaping (URL) -> Void, onMessage: ((String) -> Void)? = nil) {
        guard isAvailable else {
            onMessage?("NFC not available on this device.")
            return
        }
        self.onURL = onURL
        self.onMessage = onMessage
        let session = NFCNDEFReaderSession(
            delegate: self,
            queue: nil,
            invalidateAfterFirstRead: true
        )
        session.alertMessage = "Hold your iPhone near an NFC tag."
        self.session = session
        session.begin()
    }

    // MARK: - NFCNDEFReaderSessionDelegate

    nonisolated func readerSessionDidBecomeActive(_ session: NFCNDEFReaderSession) {}

    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        // User cancel is normal
        let ns = error as NSError
        if ns.domain == NFCReaderError.errorDomain,
           ns.code == NFCReaderError.readerSessionInvalidationErrorUserCanceled.rawValue {
            return
        }
        Task { @MainActor in
            self.onMessage?("NFC ended: \(error.localizedDescription)")
        }
    }

    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        for message in messages {
            for record in message.records {
                if let url = record.wellKnownTypeURIPayload() {
                    Task { @MainActor in
                        self.onURL?(url)
                    }
                    return
                }
                if let text = record.wellKnownTypeTextPayload().0 {
                    // If text looks like a URL, open it
                    if let url = URL(string: text), url.scheme != nil {
                        Task { @MainActor in
                            self.onURL?(url)
                        }
                        return
                    }
                    Task { @MainActor in
                        self.onMessage?(text)
                    }
                    return
                }
            }
        }
        Task { @MainActor in
            self.onMessage?("Tag read, but no URL/text found.")
        }
    }
}
