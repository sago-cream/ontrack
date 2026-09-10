import SwiftUI

struct TrainWidgetContent: View {
    let snapshot: WidgetSnapshot?
    private let appearance: WidgetAppearanceSetting

    init(
        snapshot: WidgetSnapshot?,
        appearance: WidgetAppearanceSetting = WidgetAppearanceStore.load()
    ) {
        self.snapshot = snapshot
        self.appearance = appearance
    }

    private var palette: TrainWidgetPalette {
        TrainWidgetPalette(setting: appearance)
    }

    var body: some View {
        Group {
            if let snapshot {
                widgetContent(snapshot)
            } else {
                emptyContent
            }
        }
        .padding(.horizontal, TrainWidgetLayout.horizontalPadding)
        .padding(.vertical, TrainWidgetLayout.verticalPadding)
        .background(palette.background)
    }

    private func widgetContent(_ snapshot: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: TrainWidgetLayout.rowGap) {
            HStack(spacing: TrainWidgetLayout.inlineGap) {
                Text(snapshot.originName)

                Image(systemName: "arrow.right")

                Text(snapshot.destinationName)

                Spacer(minLength: TrainWidgetLayout.sectionGap)

                TrainWidgetLogo(color: palette.primary)
                    .layoutPriority(1)
            }
            .font(TrainWidgetTypography.medium.weight(.semibold))
            .foregroundStyle(palette.secondaryText)
            .lineLimit(1)

            HStack(spacing: TrainWidgetLayout.inlineGap) {
                scheduleTime(
                    snapshot.departureTime,
                    delayMinutes: snapshot.delayMinutes
                )

                tripSeparator(for: snapshot)

                scheduleTime(
                    snapshot.arrivalTime,
                    delayMinutes: snapshot.delayMinutes
                )
            }
            .padding(.top, TrainWidgetLayout.firstRowGapIncrease)

            Spacer(minLength: 0)

            HStack(alignment: .bottom, spacing: TrainWidgetLayout.sectionGap) {
                Text(snapshot.trainIdentifier)
                    .font(TrainWidgetTypography.medium.weight(.semibold))
                    .foregroundStyle(palette.secondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)

                if let statusText = statusText(for: snapshot) {
                    Text(statusText)
                        .font(TrainWidgetTypography.medium.weight(.semibold))
                        .foregroundStyle(palette.secondaryText)
                }

                Spacer()

                if let copyURL = snapshot.copyURL {
                    Link(destination: copyURL) {
                        Image(systemName: "square.and.arrow.up")
                            .font(TrainWidgetTypography.medium.weight(.semibold))
                            .foregroundStyle(palette.primary)
                            .frame(
                                width: TrainWidgetLayout.minimumTapTarget,
                                height: TrainWidgetLayout.minimumTapTarget,
                                alignment: .bottomTrailing
                            )
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("複製到站訊息")
                }
            }
            .frame(height: TrainWidgetLayout.minimumTapTarget)
        }
    }

    private func scheduleTime(_ time: String, delayMinutes: Int?) -> some View {
        ZStack {
            Text(time)
                .font(TrainWidgetTypography.large.weight(.bold))
                .foregroundStyle(palette.text)

            if let delayMinutes, delayMinutes > 0 {
                Text(TrainDisplay.adjustedTime(time, delay: delayMinutes))
                    .font(TrainWidgetTypography.small.weight(.semibold))
                    .foregroundStyle(TrainWidgetPalette.danger)
                    .offset(y: -TrainWidgetLayout.delayTimeOffset)
            }
        }
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.85)
        .frame(height: TrainWidgetLayout.timeRowHeight)
    }

    private func tripSeparator(for snapshot: WidgetSnapshot) -> some View {
        HStack(spacing: TrainWidgetLayout.inlineGap) {
            separatorLine

            Text(
                TrainDisplay.tripDuration(
                    departure: snapshot.departureTime,
                    arrival: snapshot.arrivalTime
                )
            )
            .font(TrainWidgetTypography.small.weight(.medium))
            .foregroundStyle(palette.secondaryText)
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)

            separatorLine
        }
        .frame(maxWidth: .infinity)
    }

    private var separatorLine: some View {
        Rectangle()
            .fill(palette.border)
            .frame(minWidth: TrainWidgetLayout.minimumLineWidth, maxWidth: .infinity)
            .frame(height: 1)
    }

    private var emptyContent: some View {
        VStack(alignment: .leading, spacing: TrainWidgetLayout.sectionGap) {
            Text("尚未設定行程")
                .font(TrainWidgetTypography.large.weight(.semibold))
                .foregroundStyle(palette.text)

            Text("開啟 OnTrack 選擇路線")
                .font(TrainWidgetTypography.small.weight(.medium))
                .foregroundStyle(palette.secondaryText)

            Spacer()
        }
    }

    private func statusText(for snapshot: WidgetSnapshot) -> String? {
        guard let delayMinutes = snapshot.delayMinutes else {
            return nil
        }

        return delayMinutes > 0 ? nil : "準點"
    }
}

struct RouteCardsWidgetContent: View {
    let snapshot: WidgetSnapshot?
    private let appearance: WidgetAppearanceSetting

    init(
        snapshot: WidgetSnapshot?,
        appearance: WidgetAppearanceSetting = WidgetAppearanceStore.load()
    ) {
        self.snapshot = snapshot
        self.appearance = appearance
    }

    private var palette: TrainWidgetPalette {
        TrainWidgetPalette(setting: appearance)
    }

    var body: some View {
        Group {
            if let snapshot {
                widgetContent(snapshot)
            } else {
                emptyContent
            }
        }
        .padding(TrainWidgetLayout.compactPadding)
        .background(palette.background)
    }

    private func widgetContent(_ snapshot: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: TrainWidgetLayout.rowGap) {
            routeRow(snapshot)

            VStack(spacing: TrainWidgetLayout.rowGap) {
                ForEach(
                    Array(snapshot.displayedTrainCards.enumerated()),
                    id: \.offset
                ) { _, train in
                    trainCard(train)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func routeRow(_ snapshot: WidgetSnapshot) -> some View {
        HStack(spacing: TrainWidgetLayout.sectionGap) {
            Text(snapshot.originName)

            Image(systemName: "arrow.right")
                .accessibilityHidden(true)

            Text(snapshot.destinationName)
        }
        .font(TrainWidgetTypography.small.weight(.semibold))
        .foregroundStyle(palette.secondaryText)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private func trainCard(_ train: WidgetTrainSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: TrainWidgetLayout.inlineGap) {
                timeCluster(train)

                Spacer(minLength: TrainWidgetLayout.inlineGap)

                if let delay = train.delayMinutes, delay > 0 {
                    delayText(delay)
                }
            }

            HStack(spacing: TrainWidgetLayout.inlineGap) {
                Text(train.trainIdentifier)
                    .font(TrainWidgetTypography.small)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)

                Spacer(minLength: TrainWidgetLayout.inlineGap)

                if let price = train.price {
                    Text(price)
                        .font(TrainWidgetTypography.small)
                        .monospacedDigit()
                        .lineLimit(1)
                }
            }
        }
        .foregroundStyle(palette.onPrimary)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, TrainWidgetLayout.compactCardPadding)
        .background {
            RoundedRectangle(cornerRadius: TrainWidgetLayout.compactCardRadius)
                .fill(palette.primary)
        }
    }

    private func timeCluster(_ train: WidgetTrainSnapshot) -> some View {
        HStack(spacing: TrainWidgetLayout.inlineGap) {
            Text("\(train.departureTime) - \(train.arrivalTime)")
                .font(TrainWidgetTypography.compactTime.weight(.bold))

            Text("|")

            Text(
                TrainDisplay.tripDuration(
                    departure: train.departureTime,
                    arrival: train.arrivalTime
                )
            )
        }
        .font(TrainWidgetTypography.small)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }

    private func delayText(_ delay: Int) -> some View {
        Text(AppText.delayedMinutes(delay))
            .font(TrainWidgetTypography.small)
            .monospacedDigit()
    }

    private var emptyContent: some View {
        VStack(alignment: .leading, spacing: TrainWidgetLayout.rowGap) {
            Text("尚未設定行程")
                .font(TrainWidgetTypography.medium.weight(.semibold))
                .foregroundStyle(palette.text)

            Text("開啟 OnTrack 選擇路線")
                .font(TrainWidgetTypography.small.weight(.medium))
                .foregroundStyle(palette.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private struct TrainWidgetLogo: View {
    let color: Color

    @ViewBuilder
    var body: some View {
        if let path = Bundle.main.path(forResource: "launch-logo", ofType: "png"),
           let image = UIImage(contentsOfFile: path) {
            Image(uiImage: image)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(color)
                .frame(
                    width: TrainWidgetLayout.logoSize,
                    height: TrainWidgetLayout.logoSize
                )
                .accessibilityHidden(true)
        }
    }
}

enum TrainWidgetTypography {
    static let large = Font.system(size: 26)
    static let medium = Font.system(size: 16)
    static let compactTime = Font.system(size: 14)
    static let small = Font.system(size: 12)
}

enum TrainWidgetLayout {
    static let horizontalPadding: CGFloat = 16
    static let verticalPadding: CGFloat = 20
    static let sectionGap: CGFloat = 8
    static let rowGap: CGFloat = 4
    static let firstRowGapIncrease: CGFloat = 4
    static let inlineGap: CGFloat = 4
    static let delayTimeOffset: CGFloat = 20
    static let timeRowHeight: CGFloat = 44
    static let logoSize: CGFloat = 20
    static let minimumLineWidth: CGFloat = 4
    static let minimumTapTarget: CGFloat = 44
    static let compactPadding: CGFloat = 12
    static let compactCardPadding: CGFloat = 12
    static let compactCardRadius: CGFloat = 8
}

struct TrainWidgetPalette {
    let setting: WidgetAppearanceSetting

    var background: Color {
        switch setting {
        case .sage:
            Color(red: 255 / 255, green: 255 / 255, blue: 252 / 255)
        case .amethyst:
            Color(red: 38 / 255, green: 34 / 255, blue: 50 / 255)
        case .ember:
            Color(red: 48 / 255, green: 42 / 255, blue: 42 / 255)
        case .light:
            .white
        case .dark:
            Color(red: 30 / 255, green: 41 / 255, blue: 59 / 255)
        case .system:
            Self.adaptive(
                light: .white,
                dark: UIColor(red: 30 / 255, green: 41 / 255, blue: 59 / 255, alpha: 1)
            )
        }
    }

    var text: Color {
        switch setting {
        case .sage:
            Color(red: 25 / 255, green: 42 / 255, blue: 24 / 255)
        case .amethyst:
            Color(red: 245 / 255, green: 240 / 255, blue: 255 / 255)
        case .ember:
            Color(red: 255 / 255, green: 246 / 255, blue: 239 / 255)
        case .light:
            Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
        case .dark:
            Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255)
        case .system:
            Self.adaptive(
                light: UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1),
                dark: UIColor(red: 241 / 255, green: 245 / 255, blue: 249 / 255, alpha: 1)
            )
        }
    }

    var secondaryText: Color {
        switch setting {
        case .sage:
            Color(red: 83 / 255, green: 105 / 255, blue: 74 / 255)
        case .amethyst:
            Color(red: 189 / 255, green: 178 / 255, blue: 213 / 255)
        case .ember:
            Color(red: 205 / 255, green: 184 / 255, blue: 172 / 255)
        case .light:
            Color(red: 71 / 255, green: 85 / 255, blue: 105 / 255)
        case .dark:
            Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255)
        case .system:
            Self.adaptive(
                light: UIColor(red: 71 / 255, green: 85 / 255, blue: 105 / 255, alpha: 1),
                dark: UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 1)
            )
        }
    }

    var primary: Color {
        switch setting {
        case .sage:
            Color(red: 101 / 255, green: 145 / 255, blue: 87 / 255)
        case .amethyst:
            Color(red: 173 / 255, green: 150 / 255, blue: 218 / 255)
        case .ember:
            Color(red: 209 / 255, green: 105 / 255, blue: 35 / 255)
        case .light:
            Color(red: 53 / 255, green: 125 / 255, blue: 233 / 255)
        case .dark:
            Color(red: 96 / 255, green: 165 / 255, blue: 250 / 255)
        case .system:
            Self.adaptive(
                light: UIColor(red: 53 / 255, green: 125 / 255, blue: 233 / 255, alpha: 1),
                dark: UIColor(red: 96 / 255, green: 165 / 255, blue: 250 / 255, alpha: 1)
            )
        }
    }

    var onPrimary: Color {
        switch setting {
        case .sage:
            Self.contrastingText(
                lightBackground: UIColor(red: 101 / 255, green: 145 / 255, blue: 87 / 255, alpha: 1),
                darkBackground: UIColor(red: 101 / 255, green: 145 / 255, blue: 87 / 255, alpha: 1)
            )
        case .amethyst:
            Self.contrastingText(
                lightBackground: UIColor(red: 173 / 255, green: 150 / 255, blue: 218 / 255, alpha: 1),
                darkBackground: UIColor(red: 173 / 255, green: 150 / 255, blue: 218 / 255, alpha: 1)
            )
        case .ember:
            Self.contrastingText(
                lightBackground: UIColor(red: 209 / 255, green: 105 / 255, blue: 35 / 255, alpha: 1),
                darkBackground: UIColor(red: 209 / 255, green: 105 / 255, blue: 35 / 255, alpha: 1)
            )
        case .light:
            Self.contrastingText(
                lightBackground: UIColor(red: 53 / 255, green: 125 / 255, blue: 233 / 255, alpha: 1),
                darkBackground: UIColor(red: 53 / 255, green: 125 / 255, blue: 233 / 255, alpha: 1)
            )
        case .dark:
            Self.contrastingText(
                lightBackground: UIColor(red: 96 / 255, green: 165 / 255, blue: 250 / 255, alpha: 1),
                darkBackground: UIColor(red: 96 / 255, green: 165 / 255, blue: 250 / 255, alpha: 1)
            )
        case .system:
            Self.contrastingText(
                lightBackground: UIColor(red: 53 / 255, green: 125 / 255, blue: 233 / 255, alpha: 1),
                darkBackground: UIColor(red: 96 / 255, green: 165 / 255, blue: 250 / 255, alpha: 1)
            )
        }
    }

    var border: Color {
        switch setting {
        case .sage:
            Color(red: 101 / 255, green: 145 / 255, blue: 87 / 255).opacity(0.18)
        case .amethyst:
            Color(red: 173 / 255, green: 150 / 255, blue: 218 / 255).opacity(0.18)
        case .ember:
            Color(red: 209 / 255, green: 105 / 255, blue: 35 / 255).opacity(0.16)
        case .light:
            Color.black.opacity(0.10)
        case .dark:
            Color.white.opacity(0.10)
        case .system:
            Self.adaptive(
                light: UIColor.black.withAlphaComponent(0.10),
                dark: UIColor.white.withAlphaComponent(0.10)
            )
        }
    }

    private static let dangerUIColor = UIColor(
        red: 239 / 255,
        green: 68 / 255,
        blue: 68 / 255,
        alpha: 1
    )
    static let danger = Color(uiColor: dangerUIColor)

    private static func adaptive(light: UIColor, dark: UIColor) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }

    private static func contrastingText(
        lightBackground: UIColor,
        darkBackground: UIColor
    ) -> Color {
        Color(uiColor: UIColor { traits in
            let background = traits.userInterfaceStyle == .dark
                ? darkBackground
                : lightBackground
            return background.prefersLightForeground ? .white : .black
        })
    }
}

private extension UIColor {
    var prefersLightForeground: Bool {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        getRed(&red, green: &green, blue: &blue, alpha: nil)

        func linearized(_ component: CGFloat) -> CGFloat {
            component <= 0.04045
                ? component / 12.92
                : pow((component + 0.055) / 1.055, 2.4)
        }

        let luminance =
            0.2126 * linearized(red)
            + 0.7152 * linearized(green)
            + 0.0722 * linearized(blue)

        let whiteContrast = 1.05 / (luminance + 0.05)
        let blackContrast = (luminance + 0.05) / 0.05
        return whiteContrast >= blackContrast
    }
}
