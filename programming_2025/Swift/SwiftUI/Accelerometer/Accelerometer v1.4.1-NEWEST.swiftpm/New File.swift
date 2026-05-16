/*
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct WebGraphViewer: View {
    var body: some View {
        WebView(url: URL(string: "https://codewithchris.com/")!)
            .edgesIgnoringSafeArea(.all)
    }
}

struct WebView: UIViewRepresentable {
    let url: URL
    
    func makeUIView(context: Context) -> WKWebView {
        return WKWebView()
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        let request = URLRequest(url: url)
        webView.load(request)
    }
}
*/
