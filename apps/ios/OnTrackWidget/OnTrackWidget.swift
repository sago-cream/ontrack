import SwiftUI
import WidgetKit

struct TrainWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

private final class TimelineCompletion: @unchecked Sendable {
    private let callback: (Timeline<TrainWidgetEntry>) -> Void

    init(_ callback: @escaping (Timeline<TrainWidgetEntry>) -> Void) {
        self.callback = callback
    }

    func callAsFunction(_ timeline: Timeline<TrainWidgetEntry>) {
        callback(timeline)
    }
}

private struct TrainWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> TrainWidgetEntry {
        TrainWidgetEntry(date: Date(), snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (TrainWidgetEntry) -> Void) {
        completion(TrainWidgetEntry(
            date: Date(),
            snapshot: context.isPreview ? .preview : WidgetSnapshotStore.load()
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TrainWidgetEntry>) -> Void) {
        let completion = TimelineCompletion(completion)
        Task {
            let result = await WidgetTimelineLoader.load()
            completion(Timeline(entries: result.entries, policy: .after(result.refreshAfter)))
        }
    }
}

struct OnTrackTrainWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetSnapshotStore.widgetKind, provider: TrainWidgetProvider()) { entry in
            TrainWidgetContent(snapshot: entry.snapshot)
                .containerBackground(
                    TrainWidgetPalette(setting: WidgetAppearanceStore.load()).background,
                    for: .widget
                )
                .widgetURL(URL(string: "ontrack://open"))
        }
        .configurationDisplayName("預計搭乘")
        .description("查看下一班預計搭乘的列車。")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

struct OnTrackRouteCardsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: WidgetSnapshotStore.routeCardsWidgetKind,
            provider: TrainWidgetProvider()
        ) { entry in
            RouteCardsWidgetContent(snapshot: entry.snapshot)
                .containerBackground(
                    TrainWidgetPalette(setting: WidgetAppearanceStore.load()).background,
                    for: .widget
                )
                .widgetURL(URL(string: "ontrack://open"))
        }
        .configurationDisplayName("班次比較")
        .description("同時查看三班列車的時間、車次、誤點與票價。")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

@main
struct OnTrackWidgetBundle: WidgetBundle {
    var body: some Widget {
        OnTrackTrainWidget()
        OnTrackRouteCardsWidget()
    }
}

#Preview(as: .systemMedium) {
    OnTrackTrainWidget()
} timeline: {
    TrainWidgetEntry(date: Date(), snapshot: .preview)
}

#Preview("Route cards", as: .systemMedium) {
    OnTrackRouteCardsWidget()
} timeline: {
    TrainWidgetEntry(date: Date(), snapshot: .preview)
}
