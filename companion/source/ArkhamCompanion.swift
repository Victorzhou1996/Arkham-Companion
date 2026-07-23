import AppKit
import Foundation
import Network
import Security
import SwiftUI
import WebKit

private let manifestName = "card-image-index.json"
private let defaultServerAddress = "https://unkai-server.cloud:39000/"
private let serverAddressKey = "arkhamCompanion.serverAddress"
private let localCardServerPort: UInt16 = 8688
private let localCardServerHost = "localhost"
private let localCardServerOrigin = "https://\(localCardServerHost):\(localCardServerPort)"
private let localCertificatePassword = "arkham-companion-localhost"

private enum CardImageSource: String {
  case bundled = "App 内置"
  case userOverride = "用户替换"
}

private struct CardImageHit {
  let filename: String
  let source: CardImageSource
}

private final class LocalCardServer: @unchecked Sendable {
  private let bundledLibraryURL: URL
  private let overrideLibraryURL: URL
  private let queue = DispatchQueue(label: "local.arkhamhorror.companion.card-server")
  private let onHit: @Sendable (CardImageHit) -> Void
  private let identity: SecIdentity
  private var listener: NWListener?

  init(
    bundledLibraryURL: URL,
    overrideLibraryURL: URL,
    identity: SecIdentity,
    onHit: @escaping @Sendable (CardImageHit) -> Void
  ) {
    self.bundledLibraryURL = bundledLibraryURL
    self.overrideLibraryURL = overrideLibraryURL
    self.identity = identity
    self.onHit = onHit
  }

  func start(port: UInt16) throws {
    guard listener == nil, let endpointPort = NWEndpoint.Port(rawValue: port) else { return }
    let tls = NWProtocolTLS.Options()
    guard let localIdentity = sec_identity_create(identity) else {
      throw CompanionTLS.Error.invalidIdentity
    }
    sec_protocol_options_set_local_identity(tls.securityProtocolOptions, localIdentity)
    let parameters = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
    parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: endpointPort)
    let listener = try NWListener(using: parameters)
    listener.newConnectionHandler = { [weak self] connection in
      self?.receiveRequest(on: connection, data: Data())
    }
    listener.start(queue: queue)
    self.listener = listener
  }

  func stop() {
    listener?.cancel()
    listener = nil
  }

  private func receiveRequest(on connection: NWConnection, data: Data) {
    connection.start(queue: queue)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] chunk, _, complete, error in
      guard let self else { return }
      var requestData = data
      if let chunk { requestData.append(chunk) }
      if requestData.range(of: Data("\r\n\r\n".utf8)) != nil || complete || error != nil {
        self.respond(to: requestData, on: connection)
      } else {
        self.receiveRequest(on: connection, data: requestData)
      }
    }
  }

  private func respond(to requestData: Data, on connection: NWConnection) {
    guard
      let request = String(data: requestData, encoding: .utf8),
      let requestLine = request.components(separatedBy: "\r\n").first
    else {
      send(status: "400 Bad Request", body: Data(), contentType: "text/plain", on: connection)
      return
    }

    let parts = requestLine.split(separator: " ", maxSplits: 2).map(String.init)
    guard parts.count >= 2 else {
      send(status: "400 Bad Request", body: Data(), contentType: "text/plain", on: connection)
      return
    }

    let method = parts[0].uppercased()
    let components = URLComponents(string: parts[1])
    let path = components?.path.removingPercentEncoding ?? parts[1]
    if method == "OPTIONS" {
      send(status: "204 No Content", body: Data(), contentType: "text/plain", on: connection)
      return
    }
    guard method == "GET" || method == "HEAD" else {
      send(status: "405 Method Not Allowed", body: Data(), contentType: "text/plain", on: connection)
      return
    }

    if path == "/health" {
      let body = Data("{\"ok\":true,\"service\":\"Arkham Companion\"}".utf8)
      send(status: "200 OK", body: method == "HEAD" ? Data() : body, contentType: "application/json; charset=utf-8", on: connection, contentLength: body.count)
      return
    }

    if path == "/" || path == "/verify" {
      let body = Data(verificationPage.utf8)
      send(status: "200 OK", body: method == "HEAD" ? Data() : body, contentType: "text/html; charset=utf-8", on: connection, contentLength: body.count)
      return
    }

    guard let filename = imageFilename(from: path), let image = resolveImage(named: filename) else {
      if let fallback = validFallbackURL(from: components) {
        send(
          status: "307 Temporary Redirect",
          body: Data(),
          contentType: "text/plain",
          on: connection,
          extraHeaders: ["Location": fallback.absoluteString]
        )
        return
      }
      send(status: "404 Not Found", body: Data("Card image not found".utf8), contentType: "text/plain; charset=utf-8", on: connection)
      return
    }

    do {
      let body = try Data(contentsOf: image.url, options: .mappedIfSafe)
      onHit(CardImageHit(filename: filename, source: image.source))
      send(
        status: "200 OK",
        body: method == "HEAD" ? Data() : body,
        contentType: mimeType(for: image.url.pathExtension),
        on: connection,
        contentLength: body.count,
        extraHeaders: ["X-Arkham-Image-Source": image.source.rawValue.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? image.source.rawValue]
      )
    } catch {
      send(status: "500 Internal Server Error", body: Data(), contentType: "text/plain", on: connection)
    }
  }

  private func imageFilename(from path: String) -> String? {
    let allowedExtensions = Set(["avif", "png", "jpg", "jpeg", "webp"])
    let supportedRoute = path.contains("/cards/") || path.hasPrefix("/optimized/") || path.hasPrefix("/thumbnails/")
    guard supportedRoute else { return nil }
    let filename = URL(fileURLWithPath: path).lastPathComponent
    guard filename == (filename as NSString).lastPathComponent,
          allowedExtensions.contains((filename as NSString).pathExtension.lowercased()) else { return nil }
    return filename
  }

  private func validFallbackURL(from components: URLComponents?) -> URL? {
    guard
      let value = components?.queryItems?.first(where: { $0.name == "fallback" })?.value,
      let url = URL(string: value),
      let scheme = url.scheme?.lowercased(),
      ["http", "https"].contains(scheme),
      let host = url.host?.lowercased(),
      host != "127.0.0.1",
      host != "localhost"
    else { return nil }
    return url
  }

  private func resolveImage(named filename: String) -> (url: URL, source: CardImageSource)? {
    let manager = FileManager.default
    let override = overrideLibraryURL.appendingPathComponent(filename)
    if manager.fileExists(atPath: override.path) {
      return (override, .userOverride)
    }
    let bundled = bundledLibraryURL.appendingPathComponent(filename)
    if manager.fileExists(atPath: bundled.path) {
      return (bundled, .bundled)
    }
    return nil
  }

  private func mimeType(for pathExtension: String) -> String {
    switch pathExtension.lowercased() {
    case "avif": return "image/avif"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    default: return "application/octet-stream"
    }
  }

  private func send(
    status: String,
    body: Data,
    contentType: String,
    on connection: NWConnection,
    contentLength: Int? = nil,
    extraHeaders: [String: String] = [:]
  ) {
    var headers = [
      "HTTP/1.1 \(status)",
      "Content-Type: \(contentType)",
      "Content-Length: \(contentLength ?? body.count)",
      "Cache-Control: no-cache",
      "Access-Control-Allow-Origin: *",
      "Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers: *",
      "Access-Control-Allow-Private-Network: true",
      "Cross-Origin-Resource-Policy: cross-origin",
      "Timing-Allow-Origin: *",
      "Connection: close",
    ]
    headers.append(contentsOf: extraHeaders.map { "\($0.key): \($0.value)" })
    let response = Data((headers.joined(separator: "\r\n") + "\r\n\r\n").utf8) + body
    connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
  }

  private var verificationPage: String {
    """
    <!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Arkham Companion 卡图验证</title>
    <style>body{font:15px -apple-system,BlinkMacSystemFont,sans-serif;background:#202733;color:#e5e7eb;margin:0;padding:28px}.panel{max-width:720px;margin:auto}.card{background:#303949;border:1px solid #4b5563;border-radius:8px;padding:18px}img{display:block;max-width:320px;width:100%;border-radius:6px;margin:16px 0}code{color:#facc15}.ok{color:#a3be8c}</style>
    <div class="panel"><h1>本地卡图服务</h1><div class="card"><p class="ok">服务运行正常</p><p>下面的 <code>90083.avif</code> 直接来自 Companion，而不是服务器。</p><img src="/img/arkham/zh/cards/90083.avif" alt="90083"><p id="source">正在读取来源...</p></div></div>
    <script>fetch('/img/arkham/zh/cards/90083.avif',{method:'HEAD'}).then(r=>{const value=r.headers.get('X-Arkham-Image-Source');document.getElementById('source').textContent='响应来源：'+(value?decodeURIComponent(value):'本地卡图服务')})</script>
    """
  }
}

private final class CompanionTLS {
  enum Error: LocalizedError {
    case commandFailed(String)
    case invalidIdentity
    case missingIdentity

    var errorDescription: String? {
      switch self {
      case .commandFailed(let message): return message
      case .invalidIdentity: return "无法载入本地 HTTPS 身份"
      case .missingIdentity: return "本地 HTTPS 身份文件不存在"
      }
    }
  }

  let directory: URL
  let certificateURL: URL
  private let keyURL: URL
  private let identityURL: URL
  private let configURL: URL

  init(applicationSupportURL: URL) {
    directory = applicationSupportURL.appendingPathComponent("TLS", isDirectory: true)
    certificateURL = directory.appendingPathComponent("localhost-cert.pem")
    keyURL = directory.appendingPathComponent("localhost-key.pem")
    identityURL = directory.appendingPathComponent("localhost-identity.p12")
    configURL = directory.appendingPathComponent("openssl.cnf")
  }

  func loadOrCreateIdentity() throws -> SecIdentity {
    let manager = FileManager.default
    try manager.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700]
    )

    if !manager.fileExists(atPath: identityURL.path) || !manager.fileExists(atPath: certificateURL.path) {
      try generateIdentity()
    }

    guard manager.fileExists(atPath: identityURL.path) else { throw Error.missingIdentity }
    let data = try Data(contentsOf: identityURL)
    var imported: CFArray?
    let options = [kSecImportExportPassphrase as String: localCertificatePassword] as CFDictionary
    let status = SecPKCS12Import(data as CFData, options, &imported)
    guard status == errSecSuccess,
          let item = (imported as? [[String: Any]])?.first,
          let identity = item[kSecImportItemIdentity as String] as! SecIdentity? else {
      throw Error.invalidIdentity
    }
    return identity
  }

  func isTrusted() -> Bool {
    runSecurity(arguments: [
      "verify-cert", "-c", certificateURL.path, "-p", "ssl", "-s", localCardServerHost,
    ]) == 0
  }

  func trustForCurrentUser() throws {
    let keychain = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Keychains/login.keychain-db")
    let status = runSecurity(arguments: [
      "add-trusted-cert",
      "-r", "trustRoot",
      "-p", "ssl",
      "-s", localCardServerHost,
      "-k", keychain.path,
      certificateURL.path,
    ])
    guard status == 0 else {
      throw Error.commandFailed("无法信任本地证书，请确认钥匙串已解锁")
    }
  }

  private func generateIdentity() throws {
    let config = """
    [req]
    distinguished_name = subject
    x509_extensions = extensions
    prompt = no

    [subject]
    CN = localhost

    [extensions]
    subjectAltName = @alt_names
    basicConstraints = critical,CA:FALSE
    keyUsage = critical,digitalSignature,keyEncipherment
    extendedKeyUsage = serverAuth

    [alt_names]
    DNS.1 = localhost
    IP.1 = 127.0.0.1
    """
    try config.write(to: configURL, atomically: true, encoding: .utf8)
    try runOpenSSL(arguments: [
      "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "3650",
      "-keyout", keyURL.path,
      "-out", certificateURL.path,
      "-config", configURL.path,
    ])
    try runOpenSSL(arguments: [
      "pkcs12", "-export",
      "-inkey", keyURL.path,
      "-in", certificateURL.path,
      "-out", identityURL.path,
      "-passout", "pass:\(localCertificatePassword)",
    ])
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: keyURL.path)
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: identityURL.path)
  }

  private func runOpenSSL(arguments: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/openssl")
    process.arguments = arguments
    let errorPipe = Pipe()
    process.standardError = errorPipe
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      let message = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
        ?? "无法生成本地 HTTPS 证书"
      throw Error.commandFailed(message.trimmingCharacters(in: .whitespacesAndNewlines))
    }
  }

  private func runSecurity(arguments: [String]) -> Int32 {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    process.arguments = arguments
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    do {
      try process.run()
      process.waitUntilExit()
      return process.terminationStatus
    } catch {
      return -1
    }
  }
}

private final class GameWebView: WKWebView {
  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    guard flags.contains(.command), let key = event.charactersIgnoringModifiers?.lowercased() else {
      return super.performKeyEquivalent(with: event)
    }

    switch key {
    case "r":
      if flags.contains(.shift) {
        reloadFromOrigin()
      } else {
        reload()
      }
      return true
    case "[":
      if canGoBack { goBack() }
      return true
    case "]":
      if canGoForward { goForward() }
      return true
    case "+", "=":
      pageZoom = min(pageZoom + 0.1, 3.0)
      return true
    case "-":
      pageZoom = max(pageZoom - 0.1, 0.5)
      return true
    case "0":
      pageZoom = 1.0
      return true
    default:
      return super.performKeyEquivalent(with: event)
    }
  }
}

@MainActor
private final class GameBrowserWindowController: NSWindowController {
  private let webView: GameWebView

  init(title: String, url: URL) {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    webView = GameWebView(frame: .zero, configuration: configuration)
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = title
    window.contentView = webView
    window.minSize = NSSize(width: 800, height: 560)
    window.center()
    super.init(window: window)
    load(url)
  }

  required init?(coder: NSCoder) {
    nil
  }

  func open(_ url: URL) {
    if webView.url != url {
      load(url)
    }
    showWindow(nil)
    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  private func load(_ url: URL) {
    webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
  }
}

@main
struct ArkhamCompanionApp: App {
  @StateObject private var model = CompanionModel()

  var body: some Scene {
    WindowGroup("Arkham Horror") {
      CompanionView()
        .environmentObject(model)
        .frame(minWidth: 680, minHeight: 400)
        .onAppear { model.refresh() }
    }
    .windowResizability(.contentMinSize)
  }
}

@MainActor
final class CompanionModel: ObservableObject {
  let bundledLibraryURL: URL
  let overrideLibraryURL: URL

  @Published var effectiveCount = 0
  @Published var bundledCount = 0
  @Published var overrideCount = 0
  @Published var totalCount = 0
  @Published var failedCount = 0
  @Published var statusText = "正在检查内置卡图库..."
  @Published var busy = false
  @Published var serverAddress: String
  @Published var cardServerRunning = false
  @Published var certificateTrusted = false
  @Published var localImageHits = 0
  @Published var lastImageHit = "尚无请求"

  private var manifest: [String] = []
  private var activeTask: Task<Void, Never>?
  private var cardServer: LocalCardServer?
  private var gameWindowController: GameBrowserWindowController?
  private var verificationWindowController: GameBrowserWindowController?
  private let tls: CompanionTLS

  init() {
    bundledLibraryURL = Bundle.main.resourceURL?
      .appendingPathComponent("CardImages", isDirectory: true)
      ?? Bundle.main.bundleURL
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let applicationSupport = support.appendingPathComponent("Arkham Companion", isDirectory: true)
    overrideLibraryURL = applicationSupport
      .appendingPathComponent("CardOverrides", isDirectory: true)
    tls = CompanionTLS(applicationSupportURL: applicationSupport)
    serverAddress = UserDefaults.standard.string(forKey: serverAddressKey) ?? defaultServerAddress
  }

  var progress: Double {
    totalCount == 0 ? 0 : Double(effectiveCount) / Double(totalCount)
  }

  var progressLabel: String {
    guard totalCount > 0 else { return "尚未扫描" }
    return "\(Int((progress * 100).rounded()))%   \(effectiveCount) / \(totalCount)"
  }

  func refresh() {
    startCardServer()
    guard !busy else { return }
    activeTask?.cancel()
    activeTask = Task {
      await scanLibrary()
    }
  }

  func openWeb() {
    var value = serverAddress.trimmingCharacters(in: .whitespacesAndNewlines)
    if !value.contains("://") { value = "https://\(value)" }
    guard let url = URL(string: value), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
      statusText = "服务器地址无效"
      return
    }
    serverAddress = value
    UserDefaults.standard.set(value, forKey: serverAddressKey)
    if let controller = gameWindowController {
      controller.open(url)
    } else {
      let controller = GameBrowserWindowController(title: "Arkham Horror", url: url)
      gameWindowController = controller
      controller.open(url)
    }
    statusText = "已在独立游戏窗口打开网页版"
  }

  func openVerificationPage() {
    startCardServer()
    guard let url = URL(string: "\(localCardServerOrigin)/verify") else { return }
    if let controller = verificationWindowController {
      controller.open(url)
    } else {
      let controller = GameBrowserWindowController(title: "本地卡图验证", url: url)
      verificationWindowController = controller
      controller.open(url)
    }
  }

  func enableBrowserCardImages() {
    do {
      _ = try tls.loadOrCreateIdentity()
      try tls.trustForCurrentUser()
      certificateTrusted = tls.isTrusted()
      statusText = certificateTrusted
        ? "浏览器本地卡图已启用，请重新打开或刷新网页版"
        : "证书已加入钥匙串，但尚未生效"
    } catch {
      certificateTrusted = false
      statusText = "启用浏览器本地卡图失败：\(error.localizedDescription)"
    }
  }

  func openBundledLibrary() {
    NSWorkspace.shared.open(bundledLibraryURL)
  }

  func openOverrideLibrary() {
    ensureOverrideLibraryExists()
    NSWorkspace.shared.open(overrideLibraryURL)
  }

  func importImages() {
    let panel = NSOpenPanel()
    panel.title = "选择替换卡图或包含卡图的文件夹"
    panel.prompt = "导入"
    panel.canChooseDirectories = true
    panel.canChooseFiles = true
    panel.allowsMultipleSelection = true
    guard panel.runModal() == .OK, !panel.urls.isEmpty else { return }

    let sources = panel.urls
    let destination = overrideLibraryURL
    busy = true
    failedCount = 0
    statusText = "正在导入替换卡图..."
    activeTask = Task {
      let result = await Task.detached(priority: .userInitiated) {
        Self.copyImages(from: sources, to: destination)
      }.value
      failedCount = result.failed
      statusText = result.failed == 0
        ? "已导入 \(result.copied) 张替换卡图"
        : "已导入 \(result.copied) 张，\(result.failed) 张失败"
      busy = false
      await scanLibrary()
    }
  }

  func cancelWork() {
    activeTask?.cancel()
    activeTask = nil
    busy = false
    statusText = "操作已取消"
  }

  private func startCardServer() {
    guard cardServer == nil else { return }
    do {
      let identity = try tls.loadOrCreateIdentity()
      certificateTrusted = tls.isTrusted()
      let server = LocalCardServer(
        bundledLibraryURL: bundledLibraryURL,
        overrideLibraryURL: overrideLibraryURL,
        identity: identity
      ) { [weak self] hit in
        Task { @MainActor in
          self?.localImageHits += 1
          self?.lastImageHit = "\(hit.filename) · \(hit.source.rawValue)"
        }
      }
      try server.start(port: localCardServerPort)
      cardServer = server
      cardServerRunning = true
    } catch {
      cardServerRunning = false
      statusText = "本地卡图服务启动失败：\(error.localizedDescription)"
    }
  }

  private func scanLibrary() async {
    statusText = "正在扫描内置卡图和用户替换..."
    await loadManifest()
    ensureOverrideLibraryExists()
    let files = manifest
    let bundled = bundledLibraryURL
    let overrides = overrideLibraryURL
    let counts = await Task.detached(priority: .userInitiated) {
      var bundledCount = 0
      var effectiveCount = 0
      for name in files {
        let bundledExists = FileManager.default.fileExists(atPath: bundled.appendingPathComponent(name).path)
        let overrideExists = FileManager.default.fileExists(atPath: overrides.appendingPathComponent(name).path)
        if bundledExists { bundledCount += 1 }
        if bundledExists || overrideExists { effectiveCount += 1 }
      }
      return (
        bundled: bundledCount,
        effective: effectiveCount,
        overrides: Self.countImageFiles(in: overrides)
      )
    }.value
    bundledCount = counts.bundled
    effectiveCount = counts.effective
    overrideCount = counts.overrides
    totalCount = files.count
    if counts.effective == files.count {
      statusText = counts.overrides == 0
        ? "内置卡图库已经完整"
        : "内置卡图库完整，已启用 \(counts.overrides) 个用户替换文件"
    } else {
      statusText = "卡图库缺少 \(files.count - counts.effective) 张卡图"
    }
  }

  private func ensureOverrideLibraryExists() {
    try? FileManager.default.createDirectory(at: overrideLibraryURL, withIntermediateDirectories: true)
  }

  nonisolated private static func countImageFiles(in directory: URL) -> Int {
    let allowed = Set(["avif", "png", "jpg", "jpeg", "webp"])
    guard let enumerator = FileManager.default.enumerator(
      at: directory,
      includingPropertiesForKeys: [.isRegularFileKey],
      options: [.skipsHiddenFiles]
    ) else { return 0 }
    var count = 0
    for case let file as URL in enumerator where allowed.contains(file.pathExtension.lowercased()) {
      count += 1
    }
    return count
  }

  nonisolated private static func copyImages(from sources: [URL], to destination: URL) -> (copied: Int, failed: Int) {
    let manager = FileManager.default
    let allowed = Set(["avif", "png", "jpg", "jpeg", "webp"])
    try? manager.createDirectory(at: destination, withIntermediateDirectories: true)
    var copied = 0
    var failed = 0

    func copy(_ file: URL) {
      guard allowed.contains(file.pathExtension.lowercased()) else { return }
      let target = destination.appendingPathComponent(file.lastPathComponent)
      do {
        if manager.fileExists(atPath: target.path) {
          try manager.removeItem(at: target)
        }
        try manager.copyItem(at: file, to: target)
        copied += 1
      } catch {
        failed += 1
      }
    }

    for source in sources {
      var isDirectory: ObjCBool = false
      guard manager.fileExists(atPath: source.path, isDirectory: &isDirectory) else {
        failed += 1
        continue
      }
      if isDirectory.boolValue {
        guard let enumerator = manager.enumerator(
          at: source,
          includingPropertiesForKeys: [.isRegularFileKey],
          options: [.skipsHiddenFiles]
        ) else {
          failed += 1
          continue
        }
        for case let file as URL in enumerator { copy(file) }
      } else {
        copy(source)
      }
    }
    return (copied, failed)
  }

  private func loadManifest() async {
    guard let url = Bundle.main.url(forResource: "card-image-index", withExtension: "json") else {
      manifest = []
      totalCount = 0
      statusText = "应用内缺少卡图清单"
      return
    }
    do {
      let data = try Data(contentsOf: url)
      manifest = try JSONDecoder().decode([String].self, from: data)
      totalCount = manifest.count
    } catch {
      manifest = []
      totalCount = 0
      statusText = "无法读取卡图清单：\(error.localizedDescription)"
    }
  }
}

struct CompanionView: View {
  @EnvironmentObject private var model: CompanionModel

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .center, spacing: 12) {
        Image(systemName: "books.vertical.fill")
          .font(.system(size: 34))
          .foregroundStyle(Color.accentColor)
        VStack(alignment: .leading, spacing: 2) {
          Text("Arkham Horror 本地伴随程序")
            .font(.title2.bold())
          Text("内置卡图、用户替换与独立游戏窗口")
            .foregroundStyle(.secondary)
        }
        Spacer()
        Button {
          model.openWeb()
        } label: {
          Label("打开游戏窗口", systemImage: "macwindow")
        }
        .buttonStyle(.borderedProminent)
      }

      GroupBox("随 App 安装的卡图库") {
        VStack(alignment: .leading, spacing: 12) {
          HStack {
            ProgressView(value: model.progress)
            Text(model.progressLabel)
              .font(.system(.caption, design: .monospaced))
              .frame(width: 150, alignment: .trailing)
          }

          Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 5) {
            GridRow {
              Text("内置")
                .foregroundStyle(.secondary)
              Text(model.bundledLibraryURL.path)
                .font(.system(.caption, design: .monospaced))
                .lineLimit(1)
                .textSelection(.enabled)
            }
            GridRow {
              Text("替换")
                .foregroundStyle(.secondary)
              Text(model.overrideLibraryURL.path)
                .font(.system(.caption, design: .monospaced))
                .lineLimit(1)
                .textSelection(.enabled)
            }
          }

          HStack(spacing: 10) {
            Button {
              model.importImages()
            } label: {
              Label("导入替换卡图", systemImage: "square.and.arrow.down")
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.busy)

            Button {
              model.openOverrideLibrary()
            } label: {
              Label("打开替换目录", systemImage: "folder")
            }

            Button {
              model.openBundledLibrary()
            } label: {
              Label("查看内置卡图", systemImage: "shippingbox")
            }

            Button {
              model.refresh()
            } label: {
              Image(systemName: "arrow.clockwise")
            }
            .help("重新扫描")
            .disabled(model.busy)

            if model.busy {
              Button("取消") { model.cancelWork() }
            }
          }

          Divider()

          HStack(spacing: 12) {
            Label(
              model.cardServerRunning ? "本地卡图服务已运行" : "本地卡图服务未运行",
              systemImage: model.cardServerRunning ? "checkmark.circle.fill" : "xmark.circle.fill"
            )
            .foregroundStyle(model.cardServerRunning ? .green : .red)

            Text("https://\(localCardServerHost):\(localCardServerPort)")
              .font(.system(.caption, design: .monospaced))
              .foregroundStyle(.secondary)

            Spacer()

            Button {
              model.openVerificationPage()
            } label: {
              Label("验证本地卡图", systemImage: "checkmark.shield")
            }
            .disabled(!model.cardServerRunning)

            if !model.certificateTrusted {
              Button {
                model.enableBrowserCardImages()
              } label: {
                Label("启用浏览器本地卡图", systemImage: "key.fill")
              }
              .buttonStyle(.borderedProminent)
            } else {
              Label("本地证书已信任", systemImage: "checkmark.seal.fill")
                .foregroundStyle(.green)
            }
          }

          Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 5) {
            GridRow {
              Text("本地命中")
                .foregroundStyle(.secondary)
              Text("\(model.localImageHits)")
                .font(.system(.caption, design: .monospaced))
            }
            GridRow {
              Text("最近来源")
                .foregroundStyle(.secondary)
              Text(model.lastImageHit)
                .font(.system(.caption, design: .monospaced))
            }
          }

          Text("同名文件使用用户替换版本；删除替换文件后自动恢复 App 内置版本。游戏账号、联机与存档仍由远端服务器处理。")
            .font(.caption)
            .foregroundStyle(.secondary)

          HStack {
            Text("服务器地址")
              .foregroundStyle(.secondary)
            TextField("网页版地址", text: $model.serverAddress)
              .textFieldStyle(.roundedBorder)
              .onSubmit { model.openWeb() }
          }
        }
        .padding(.vertical, 6)
      }

      HStack(spacing: 8) {
        if model.busy { ProgressView().controlSize(.small) }
        Text(model.statusText)
          .foregroundStyle(model.failedCount > 0 ? .orange : .secondary)
          .lineLimit(2)
        Spacer()
      }

      Text("未签名测试版。首次启动时请右键应用并选择“打开”。")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(22)
  }
}
