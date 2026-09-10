import {
    forwardRef,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
    type ClipboardEvent,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import {
    ArrowLeft,
    ArrowUpRight,
    Check,
    ChevronRight,
    CircleHelp,
    Download,
    Hand,
    Heart,
    LoaderCircle,
    RotateCw,
    X,
} from 'lucide-react';

import { LANGUAGE_OPTIONS } from '../i18n/translations';
import type { LanguageCode } from '../i18n/types';
import { useI18n } from '../i18n/useI18n';
import {
    getSampleShareMessageTemplateValues,
    getShareMessagePresets,
    parseShareMessageTemplate,
    renderShareMessageTemplate,
    SHARE_MESSAGE_TOKENS,
    shareMessageToken,
    type ShareMessageToken,
} from '../shareMessage';

import './SettingsSheet.css';

import {
    isAndroid,
    NativeApp,
    selectionFeedback,
    usesNativeUI,
    type AppearanceMode,
    type AppIcon,
} from '../native/platform';
import { useModal } from '../native/useModal';
import type { useNativeState } from '../native/useNativeState';

export type { AppearanceMode } from '../native/platform';

interface SettingsSheetProps {
    native: ReturnType<typeof useNativeState>;
    originName: string;
    destinationName: string;
    isOpen: boolean;
    onClose: () => void;
    appearanceMode: AppearanceMode;
    onAppearanceModeChange: (mode: AppearanceMode) => void;
    electronicTicketOnly: boolean;
    onElectronicTicketOnlyChange: (enabled: boolean) => void;
    messageTemplate: string;
    onMessageTemplateChange: (template: string) => void;
}

const APPEARANCE_OPTIONS: {
    value: AppearanceMode;
    labelKey:
        | 'settings.appearanceSystem'
        | 'settings.appearanceLight'
        | 'settings.appearanceDark'
        | 'settings.appearanceSage'
        | 'settings.appearanceAmethyst'
        | 'settings.appearanceEmber';
}[] = [
    { value: 'system', labelKey: 'settings.appearanceSystem' },
    { value: 'light', labelKey: 'settings.appearanceLight' },
    { value: 'dark', labelKey: 'settings.appearanceDark' },
    { value: 'sage', labelKey: 'settings.appearanceSage' },
    { value: 'amethyst', labelKey: 'settings.appearanceAmethyst' },
    { value: 'ember', labelKey: 'settings.appearanceEmber' },
];

const SUPPORT_URL = 'https://ontrack.hsichen.dev/docs/support';
const PRIVACY_URL = 'https://ontrack.hsichen.dev/docs/privacy';

export function SettingsSheet({
    native,
    originName,
    destinationName,
    isOpen,
    onClose,
    appearanceMode,
    onAppearanceModeChange,
    electronicTicketOnly,
    onElectronicTicketOnlyChange,
    messageTemplate,
    onMessageTemplateChange,
}: SettingsSheetProps) {
    const { language, setLanguage, t } = useI18n();
    const [page, setPage] = useState<'settings' | 'messageFormat'>('settings');

    const close = () => {
        setPage('settings');
        onClose();
    };
    const modalRef = useModal(isOpen, () =>
        page === 'messageFormat' ? setPage('settings') : close()
    );
    if (!isOpen) return null;
    const nativeUI = usesNativeUI();
    const sampleValues = {
        ...getSampleShareMessageTemplateValues(language),
        origin: originName || (language === 'en' ? 'Taipei' : '臺北'),
        destination:
            destinationName || (language === 'en' ? 'Hsinchu' : '新竹'),
    };
    const messagePreview = renderShareMessageTemplate(
        messageTemplate,
        sampleValues
    );

    return (
        <div className='settings-backdrop' onClick={close}>
            <section
                ref={modalRef}
                className='settings-sheet'
                role='dialog'
                aria-modal='true'
                aria-labelledby='settings-title'
                onClick={(event) => event.stopPropagation()}
            >
                <div className='settings-handle' />
                <div className='settings-header'>
                    {page === 'messageFormat' ? (
                        <button
                            type='button'
                            className='settings-back'
                            onClick={() => setPage('settings')}
                            aria-label={t('common.back')}
                            title={t('common.back')}
                        >
                            <ArrowLeft aria-hidden='true' />
                        </button>
                    ) : null}
                    <h2 id='settings-title'>
                        {page === 'messageFormat'
                            ? t('settings.messageEditorTitle')
                            : t('settings.title')}
                    </h2>
                    <button
                        type='button'
                        className='settings-close'
                        onClick={close}
                        aria-label={t('common.close')}
                        title={t('common.close')}
                    >
                        <X aria-hidden='true' />
                    </button>
                </div>

                {page === 'settings' ? (
                    <div className='settings-list'>
                        {!nativeUI && (
                            <SettingsOptionGroup title={t('settings.language')}>
                                {LANGUAGE_OPTIONS.map((option) => (
                                    <SettingsOptionButton
                                        key={option.code}
                                        label={option.label}
                                        isSelected={language === option.code}
                                        onClick={() =>
                                            setLanguage(
                                                option.code as LanguageCode
                                            )
                                        }
                                    />
                                ))}
                            </SettingsOptionGroup>
                        )}

                        {!nativeUI && <div className='settings-divider' />}
                        {nativeUI && native.state.updateVersion ? (
                            <>
                                <SettingsOptionGroup
                                    title={t('settings.updateAvailable')}
                                >
                                    <button
                                        className='settings-native-action'
                                        onClick={() =>
                                            void NativeApp.openStore()
                                        }
                                    >
                                        <Download />
                                        {t('settings.updateNow')}
                                    </button>
                                    <button
                                        className='settings-native-action'
                                        onClick={() => {
                                            void NativeApp.ignoreUpdate({
                                                version:
                                                    native.state.updateVersion!,
                                            }).then(native.refresh);
                                        }}
                                    >
                                        {t('settings.ignoreUpdate')}
                                    </button>
                                </SettingsOptionGroup>
                                <div className='settings-divider' />
                            </>
                        ) : null}
                        {nativeUI && native.state.supporter ? (
                            <>
                                <SettingsOptionGroup
                                    title={t('settings.appIcon')}
                                >
                                    <div className='app-icon-grid'>
                                        {(
                                            [
                                                'primary',
                                                'dark',
                                                'sage',
                                                'amethyst',
                                                'ember',
                                            ] as AppIcon[]
                                        ).map((icon) => (
                                            <button
                                                key={icon}
                                                className='app-icon-option'
                                                aria-label={icon}
                                                aria-pressed={
                                                    native.state.icon === icon
                                                }
                                                onClick={async () => {
                                                    if (isAndroid())
                                                        await NativeApp.setIcon(
                                                            { icon }
                                                        );
                                                    native.setState({
                                                        ...native.state,
                                                        icon,
                                                    });
                                                    selectionFeedback();
                                                }}
                                            >
                                                <img
                                                    src={`/icons/${icon}.png`}
                                                    alt=''
                                                />
                                                <span>
                                                    {native.state.icon ===
                                                    icon ? (
                                                        <Check />
                                                    ) : null}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </SettingsOptionGroup>
                                <div className='settings-divider' />
                            </>
                        ) : null}

                        <SettingsOptionGroup
                            title={t(
                                nativeUI
                                    ? 'settings.theme'
                                    : 'settings.appearance'
                            )}
                        >
                            <div
                                className={
                                    nativeUI
                                        ? 'theme-picker'
                                        : 'settings-option-controls'
                                }
                            >
                                {APPEARANCE_OPTIONS.filter(
                                    (option) =>
                                        ['system', 'light', 'dark'].includes(
                                            option.value
                                        ) || native.state.supporter
                                ).map((option) =>
                                    nativeUI ? (
                                        <button
                                            key={option.value}
                                            className='theme-option'
                                            aria-label={t(option.labelKey)}
                                            aria-pressed={
                                                appearanceMode === option.value
                                            }
                                            onClick={() => {
                                                onAppearanceModeChange(
                                                    option.value
                                                );
                                                selectionFeedback();
                                            }}
                                        >
                                            <span
                                                className={`theme-swatch theme-${option.value}`}
                                            />
                                            <span>{t(option.labelKey)}</span>
                                        </button>
                                    ) : (
                                        <SettingsOptionButton
                                            key={option.value}
                                            label={t(option.labelKey)}
                                            isSelected={
                                                appearanceMode === option.value
                                            }
                                            onClick={() =>
                                                onAppearanceModeChange(
                                                    option.value
                                                )
                                            }
                                        />
                                    )
                                )}
                            </div>
                        </SettingsOptionGroup>

                        <div className='settings-divider' />

                        <SettingsOptionGroup
                            title={t('settings.defaultMessageFormat')}
                        >
                            <SettingsNavigationButton
                                label={t('settings.customizeMessage')}
                                detail={messagePreview}
                                onClick={() => setPage('messageFormat')}
                            />
                        </SettingsOptionGroup>

                        <div className='settings-divider' />

                        <SettingsOptionGroup title={t('settings.trainFilters')}>
                            <SettingsToggle
                                label={t('settings.electronicTicketOnly')}
                                isEnabled={electronicTicketOnly}
                                onChange={onElectronicTicketOnlyChange}
                            />
                        </SettingsOptionGroup>

                        <div className='settings-divider' />

                        {nativeUI ? (
                            <>
                                <SettingsOptionGroup
                                    title={t('settings.supportOnTrack')}
                                >
                                    <button
                                        className='settings-native-action'
                                        disabled={
                                            native.busy ||
                                            native.state.supporter ||
                                            !native.state.billingAvailable
                                        }
                                        onClick={() =>
                                            void native.transact(false)
                                        }
                                    >
                                        {native.busy ? (
                                            <LoaderCircle className='is-spinning' />
                                        ) : native.state.supporter ? (
                                            <Check />
                                        ) : (
                                            <Heart />
                                        )}
                                        {native.state.supporter
                                            ? t('settings.supported')
                                            : native.state.price
                                              ? t('settings.leaveTipPrice', {
                                                    price: native.state.price,
                                                })
                                              : t('settings.leaveTip')}
                                    </button>
                                    <button
                                        className='settings-native-action'
                                        disabled={native.busy}
                                        onClick={() =>
                                            void native.transact(true)
                                        }
                                    >
                                        <RotateCw />
                                        {t('settings.restorePurchases')}
                                    </button>
                                    {native.status ? (
                                        <p
                                            className='settings-footnote'
                                            role='status'
                                        >
                                            {t(
                                                `settings.purchase.${native.status as 'supported' | 'pending' | 'unavailable' | 'noPurchases'}`
                                            )}
                                        </p>
                                    ) : null}
                                    {!native.state.supporter ? (
                                        <p className='settings-footnote'>
                                            {t('settings.supportFootnote')}
                                        </p>
                                    ) : null}
                                </SettingsOptionGroup>
                                <div className='settings-divider' />
                            </>
                        ) : null}

                        <SettingsOptionGroup title={t('settings.links')}>
                            <SettingsLink
                                href={SUPPORT_URL}
                                icon={<CircleHelp />}
                                label={t('settings.support')}
                            />
                            <SettingsLink
                                href={PRIVACY_URL}
                                icon={<Hand />}
                                label={t('settings.privacy')}
                            />
                        </SettingsOptionGroup>
                    </div>
                ) : (
                    <MessageFormatEditor
                        language={language}
                        originName={originName}
                        destinationName={destinationName}
                        messageTemplate={messageTemplate}
                        onMessageTemplateChange={onMessageTemplateChange}
                    />
                )}
            </section>
        </div>
    );
}

function SettingsOptionGroup({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <div className='settings-option-group'>
            <div className='settings-option-title'>{title}</div>
            <div className='settings-option-controls'>{children}</div>
        </div>
    );
}

function SettingsToggle({
    label,
    isEnabled,
    onChange,
}: {
    label: string;
    isEnabled: boolean;
    onChange: (enabled: boolean) => void;
}) {
    return (
        <label className='settings-toggle'>
            <span>{label}</span>
            <input
                type='checkbox'
                checked={isEnabled}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className='settings-toggle-track' aria-hidden='true'>
                <span className='settings-toggle-thumb' />
            </span>
        </label>
    );
}

function SettingsNavigationButton({
    label,
    detail,
    onClick,
}: {
    label: string;
    detail: string;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            className='settings-option-button settings-navigation-button'
            onClick={onClick}
        >
            <span>{label}</span>
            <span className='settings-navigation-detail'>{detail}</span>
            <ChevronRight aria-hidden='true' />
        </button>
    );
}

function MessageFormatEditor({
    language,
    originName,
    destinationName,
    messageTemplate,
    onMessageTemplateChange,
}: {
    language: LanguageCode;
    originName: string;
    destinationName: string;
    messageTemplate: string;
    onMessageTemplateChange: (template: string) => void;
}) {
    const { t } = useI18n();
    const editorRef = useRef<InlineMessageEditorHandle>(null);
    const sampleValues = {
        ...getSampleShareMessageTemplateValues(language),
        ...(originName ? { origin: originName } : {}),
        ...(destinationName ? { destination: destinationName } : {}),
    };
    const preview = renderShareMessageTemplate(messageTemplate, sampleValues);
    const presets = getShareMessagePresets(language);
    const tokenLabels = Object.fromEntries(
        SHARE_MESSAGE_TOKENS.map((token) => [
            token,
            t(`settings.token.${token}`),
        ])
    ) as Record<ShareMessageToken, string>;

    const insertToken = (token: ShareMessageToken) => {
        editorRef.current?.insertToken(token);
    };

    return (
        <div className='message-editor settings-list'>
            <div className='message-editor-section'>
                <p className='message-editor-intro'>
                    {t('settings.messageEditorIntro')}
                </p>

                <div className='message-editor-preview' aria-live='polite'>
                    <span>{t('settings.preview')}</span>
                    <p>{preview || t('settings.messageEditorEmptyPreview')}</p>
                </div>
            </div>

            <div className='settings-divider' />

            <div className='message-editor-section'>
                <div className='message-editor-label' id='message-editor-label'>
                    {t('settings.message')}
                </div>
                <InlineMessageEditor
                    ref={editorRef}
                    template={messageTemplate}
                    tokenLabels={tokenLabels}
                    placeholder={t('settings.messageEditorEmptyPreview')}
                    onChange={onMessageTemplateChange}
                />

                <div className='message-token-list'>
                    {SHARE_MESSAGE_TOKENS.map((token) => (
                        <button
                            key={token}
                            type='button'
                            className='message-token'
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => insertToken(token)}
                        >
                            {t(`settings.token.${token}`)}
                        </button>
                    ))}
                </div>
            </div>

            <div className='settings-divider' />

            <div className='message-editor-section'>
                <div className='message-editor-label'>
                    {t('settings.presets')}
                </div>
                <div className='message-preset-list'>
                    {presets.map((preset) => {
                        const isSelected = messageTemplate === preset.template;
                        return (
                            <button
                                key={preset.id}
                                type='button'
                                className={`message-preset ${isSelected ? 'selected' : ''}`}
                                onClick={() =>
                                    onMessageTemplateChange(preset.template)
                                }
                                aria-pressed={isSelected}
                            >
                                <span>{t(`settings.preset.${preset.id}`)}</span>
                                <small>
                                    {renderShareMessageTemplate(
                                        preset.template,
                                        sampleValues
                                    )}
                                </small>
                                {isSelected ? (
                                    <Check aria-hidden='true' />
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

type InlineMessageEditorHandle = {
    insertToken: (token: ShareMessageToken) => void;
};

const ZERO_WIDTH_SPACE = '\u200B';

function createInlineTokenPill(token: ShareMessageToken, label: string) {
    const pill = document.createElement('span');
    pill.className = 'message-inline-token';
    pill.contentEditable = 'false';
    pill.dataset.shareToken = token;
    pill.setAttribute('aria-label', label);
    pill.textContent = label;
    return pill;
}

const InlineMessageEditor = forwardRef<
    InlineMessageEditorHandle,
    {
        template: string;
        tokenLabels: Record<ShareMessageToken, string>;
        placeholder: string;
        onChange: (template: string) => void;
    }
>(function InlineMessageEditor(
    { template, tokenLabels, placeholder, onChange },
    forwardedRef
) {
    const editorRef = useRef<HTMLDivElement>(null);

    const emitChange = () => {
        const editor = editorRef.current;
        if (editor) onChange(serializeInlineEditor(editor));
    };

    const insertTextAtSelection = (text: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.focus();
        const selection = window.getSelection();
        const range =
            selection?.rangeCount &&
            editor.contains(selection.getRangeAt(0).commonAncestorContainer)
                ? selection.getRangeAt(0)
                : document.createRange();

        if (!editor.contains(range.commonAncestorContainer)) {
            range.selectNodeContents(editor);
            range.collapse(false);
        }

        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        emitChange();
    };

    useImperativeHandle(forwardedRef, () => ({
        insertToken(token) {
            const editor = editorRef.current;
            if (!editor) return;

            editor.focus();
            const selection = window.getSelection();
            const range =
                selection?.rangeCount &&
                editor.contains(selection.getRangeAt(0).commonAncestorContainer)
                    ? selection.getRangeAt(0)
                    : document.createRange();

            if (!editor.contains(range.commonAncestorContainer)) {
                range.selectNodeContents(editor);
                range.collapse(false);
            }

            range.deleteContents();
            const pill = createInlineTokenPill(token, tokenLabels[token]);
            const caretAnchor = document.createTextNode(ZERO_WIDTH_SPACE);
            range.insertNode(caretAnchor);
            range.insertNode(pill);
            range.setStart(caretAnchor, caretAnchor.length);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
            emitChange();
        },
    }));

    useLayoutEffect(() => {
        const editor = editorRef.current;
        if (!editor || serializeInlineEditor(editor) === template) return;

        const fragment = document.createDocumentFragment();
        for (const segment of parseShareMessageTemplate(template)) {
            fragment.append(
                segment.type === 'token'
                    ? createInlineTokenPill(
                          segment.token,
                          tokenLabels[segment.token]
                      )
                    : document.createTextNode(segment.value)
            );
        }
        editor.replaceChildren(fragment);
    }, [template, tokenLabels]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            insertTextAtSelection('\n');
        }
    };

    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        insertTextAtSelection(event.clipboardData.getData('text/plain'));
    };

    return (
        <div
            ref={editorRef}
            className='message-template-input'
            contentEditable
            suppressContentEditableWarning
            role='textbox'
            aria-labelledby='message-editor-label'
            aria-multiline='true'
            data-placeholder={placeholder}
            spellCheck
            onInput={emitChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
        />
    );
});

function serializeInlineEditor(editor: HTMLElement) {
    const serializeNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent ?? '').replaceAll(ZERO_WIDTH_SPACE, '');
        }
        if (!(node instanceof HTMLElement)) return '';

        const token = node.dataset.shareToken as ShareMessageToken | undefined;
        if (token) return shareMessageToken(token);
        if (node.tagName === 'BR') return '\n';

        const content = Array.from(node.childNodes).map(serializeNode).join('');
        return node !== editor && node.tagName === 'DIV'
            ? `${content}\n`
            : content;
    };

    return Array.from(editor.childNodes)
        .map(serializeNode)
        .join('')
        .replace(/\n$/, '');
}

function SettingsOptionButton({
    label,
    isSelected,
    onClick,
}: {
    label: string;
    isSelected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            className={`settings-option-button ${isSelected ? 'selected' : ''}`}
            onClick={onClick}
            aria-pressed={isSelected}
        >
            <span>{label}</span>
            {isSelected ? <Check aria-hidden='true' /> : null}
        </button>
    );
}

function SettingsLink({
    href,
    label,
    icon,
}: {
    href: string;
    label: string;
    icon?: ReactNode;
}) {
    return (
        <a
            className='settings-option-link'
            href={href}
            target='_blank'
            rel='noreferrer'
        >
            {icon}
            <span>{label}</span>
            <ArrowUpRight aria-hidden='true' />
        </a>
    );
}
