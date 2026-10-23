import UIKit
import AVKit
import Photos
import PhotosUI
import Capacitor

/// The app's screen: the normal Capacitor web view, plus our PhotoLink plugin.
class SetlisticViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoLinkPlugin())
    }
}

/// Links to videos and photos in the camera roll instead of copying them into the app.
/// The web code keeps only each item's Photos identifier plus a small preview image.
///
/// JS: Capacitor.nativePromise('PhotoLink', <method>, options)
///   access({request})          -> {status}
///   openSettings()
///   pick({type, thumbSize})    -> {items: [{id, type, duration, created, width, height, thumb}], missing}
///   image({id, maxSize})       -> {data}   (base64 JPEG)
///   play({ids})                -> resolves when the player is closed
///   videoFile({id})            -> {path}  file to play inside the app (Featured feed)
@objc(PhotoLinkPlugin)
public class PhotoLinkPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "PhotoLinkPlugin"
    public let jsName = "PhotoLink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "access", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "image", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "videoFile", returnType: CAPPluginReturnPromise)
    ]

    private var pickCall: CAPPluginCall?
    /// Keeps Photos' video files open (and readable) while the feed is playing them.
    private var openAssets = [String: AVURLAsset]()
    private let assetLock = NSLock()
    private var pickThumbSize: CGFloat = 480

    // MARK: - Photo library permission

    private func statusName(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .limited: return "limited"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    @objc func access(_ call: CAPPluginCall) {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if current == .notDetermined && call.getBool("request", false) {
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                call.resolve(["status": self.statusName(status)])
            }
        } else {
            call.resolve(["status": statusName(current)])
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    // MARK: - Picking

    @objc func pick(_ call: CAPPluginCall) {
        let type = call.getString("type", "video")
        pickThumbSize = CGFloat(call.getInt("thumbSize", 480))
        DispatchQueue.main.async {
            var config = PHPickerConfiguration(photoLibrary: .shared())
            config.filter = type == "image" ? .images : .videos
            config.selectionLimit = 0
            config.selection = .ordered
            // Hand back the item as it is: no converting or copying.
            config.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            self.pickCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pickCall else { return }
        pickCall = nil

        let ids = results.compactMap { $0.assetIdentifier }
        let assets = fetch(ids)
        let size = pickThumbSize
        var items = [[String: Any]?](repeating: nil, count: ids.count)
        let group = DispatchGroup()

        for (index, id) in ids.enumerated() {
            guard let asset = assets[id] else { continue }
            group.enter()
            thumbnail(asset, size: size) { data in
                DispatchQueue.main.async {
                    items[index] = [
                        "id": id,
                        "type": asset.mediaType == .video ? "video" : "image",
                        "duration": asset.duration,
                        "created": (asset.creationDate?.timeIntervalSince1970 ?? 0) * 1000,
                        "width": asset.pixelWidth,
                        "height": asset.pixelHeight,
                        "thumb": data?.base64EncodedString() ?? ""
                    ]
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            call.resolve([
                "items": items.compactMap { $0 },
                // Picked but not readable (e.g. only "Limited" photo access was given).
                "missing": ids.count - assets.count
            ])
        }
    }

    // MARK: - Images

    private func fetch(_ ids: [String]) -> [String: PHAsset] {
        var map = [String: PHAsset]()
        guard !ids.isEmpty else { return map }
        let result = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        result.enumerateObjects { asset, _, _ in
            map[asset.localIdentifier] = asset
        }
        return map
    }

    private func thumbnail(_ asset: PHAsset, size: CGFloat, done: @escaping (Data?) -> Void) {
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: CGSize(width: size, height: size),
            contentMode: .aspectFill,
            options: options
        ) { image, _ in
            done(image?.jpegData(compressionQuality: 0.8))
        }
    }

    @objc func image(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let asset = fetch([id])[id] else {
            call.reject("This photo isn't in your camera roll any more", "MISSING")
            return
        }
        let maxSize = CGFloat(call.getInt("maxSize", 2048))
        let width = CGFloat(asset.pixelWidth)
        let height = CGFloat(asset.pixelHeight)
        let scale = min(1, maxSize / max(width, height, 1))
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: CGSize(width: width * scale, height: height * scale),
            contentMode: .aspectFit,
            options: options
        ) { image, _ in
            guard let data = image?.jpegData(compressionQuality: 0.85) else {
                call.reject("Couldn't load this photo")
                return
            }
            call.resolve(["data": data.base64EncodedString()])
        }
    }

    // MARK: - Playing videos straight from the camera roll

    @objc func play(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        let assets = fetch(ids)
        let videos = ids.compactMap { assets[$0] }.filter { $0.mediaType == .video }
        guard !videos.isEmpty else {
            call.reject("This video isn't in your camera roll any more", "MISSING")
            return
        }

        // Play sound even when the phone is on silent, like the Photos app.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        playerItems(for: videos) { items in
            guard !items.isEmpty else {
                call.reject("Couldn't load this video")
                return
            }
            let player = AVQueuePlayer(items: items)
            let controller = ClosingPlayerViewController()
            controller.player = player
            controller.onClose = {
                player.pause()
                call.resolve(["missing": ids.count - videos.count])
            }
            self.bridge?.viewController?.present(controller, animated: true) {
                player.play()
            }
        }
    }

    /// Player items in the same order as the videos. Videos stored in iCloud stream from there.
    private func playerItems(for assets: [PHAsset], done: @escaping ([AVPlayerItem]) -> Void) {
        var items = [AVPlayerItem?](repeating: nil, count: assets.count)
        let group = DispatchGroup()
        for (index, asset) in assets.enumerated() {
            group.enter()
            let options = PHVideoRequestOptions()
            options.isNetworkAccessAllowed = true
            options.deliveryMode = .automatic
            PHImageManager.default().requestPlayerItem(forVideo: asset, options: options) { item, _ in
                DispatchQueue.main.async {
                    items[index] = item
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) {
            done(items.compactMap { $0 })
        }
    }
}

// MARK: - Playing camera-roll videos inside the web view (Featured feed)

extension PhotoLinkPlugin {
    /// Temporary copies live here (only used when Photos' own file can't be read directly).
    private static let feedDir: URL = {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("feed", isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private func newTempFile(ext: String) -> URL {
        let dir = PhotoLinkPlugin.feedDir
        // Keep only the newest few temporary copies.
        if let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.creationDateKey]) {
            let sorted = files.sorted {
                let a = (try? $0.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
                let b = (try? $1.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
                return a > b
            }
            for old in sorted.dropFirst(4) { try? FileManager.default.removeItem(at: old) }
        }
        return dir.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext.isEmpty ? "mov" : ext.lowercased())
    }

    @objc func videoFile(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing video")
            return
        }
        let fetched = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil)
        guard let asset = fetched.firstObject, asset.mediaType == .video else {
            call.reject("This video isn't in your camera roll any more", "MISSING")
            return
        }
        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.deliveryMode = .highQualityFormat
        options.version = .current

        PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
            // Normal videos: play Photos' own file directly – no copy.
            if let urlAsset = avAsset as? AVURLAsset {
                let url = urlAsset.url
                self.assetLock.lock()
                self.openAssets[id] = urlAsset
                if self.openAssets.count > 12 { self.openAssets.removeValue(forKey: self.openAssets.keys.first!) }
                self.assetLock.unlock()
                if FileManager.default.isReadableFile(atPath: url.path) {
                    call.resolve(["path": url.path])
                    return
                }
                let dest = self.newTempFile(ext: url.pathExtension)
                do {
                    try FileManager.default.copyItem(at: url, to: dest)
                    call.resolve(["path": dest.path])
                } catch {
                    call.reject("Couldn't open this video")
                }
                return
            }
            // Slow-motion or edited videos: make a playable temporary copy.
            guard let avAsset = avAsset,
                  let export = AVAssetExportSession(asset: avAsset, presetName: AVAssetExportPresetHighestQuality) else {
                call.reject("Couldn't open this video")
                return
            }
            let dest = self.newTempFile(ext: "mp4")
            export.outputURL = dest
            export.outputFileType = .mp4
            export.exportAsynchronously {
                if export.status == .completed {
                    call.resolve(["path": dest.path])
                } else {
                    call.reject("Couldn't open this video")
                }
            }
        }
    }
}

/// Full-screen video player that tells us when it has been closed.
class ClosingPlayerViewController: AVPlayerViewController {
    var onClose: (() -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil {
            onClose?()
            onClose = nil
        }
    }
}
