import {
  workspace as Workspace,

  Disposable,
  ExtensionContext,
  WebviewPanel,
  ViewColumn,
  window,
  WebviewPanelOnDidChangeViewStateEvent
} from 'vscode';

import {getCustomSettings} from '../../extensions/helpers/settings';
import {IThemeCustomSettings} from '../../extensions/interfaces/itheme-custom-properties';

interface SettingsChangedMessage {
  type: 'settingsChanged';
  config: IThemeCustomSettings;
}

interface SaveSettingsMessage {
  type: 'saveSettings';
  changes: {
      [key: string]: any;
  };
  removes: string[];
  scope: 'user' | 'workspace';
  uri: string;
}

type Message = SaveSettingsMessage | SettingsChangedMessage;
type Invalidates = 'all' | 'config' | undefined;

export abstract class WebviewEditor extends Disposable {
  private panel: WebviewPanel | undefined;
  private disposablePanel: Disposable | undefined;
  private invalidateOnVisible: Invalidates;

  constructor() {
    // Applying dispose callback for our disposable function
    super(() => this.dispose());
  }

  abstract get filename(): string;
  abstract get id(): string;
  abstract get title(): string;
  abstract get context(): ExtensionContext;

  dispose() {
    if (this.disposablePanel) {
      this.disposablePanel.dispose();
    }
  }

  private async getHtml(): Promise<string> {
    const doc = await Workspace.openTextDocument(this.context.asAbsolutePath(this.filename));
    return doc.getText();
  }

  private postMessage(message: Message, invalidates: Invalidates = 'all') {
    if (this.panel === undefined) {
      return false;
    }

    const result = this.panel.webview.postMessage(message);

    // If post was ok, update invalidateOnVisible if different than default
    if (!result && this.invalidateOnVisible !== 'all') {
      this.invalidateOnVisible = invalidates;
    }

    return result;
  }

  private postUpdatedConfiguration() {
    // Post full raw configuration
    return this.postMessage({
      type: 'settingsChanged',
      config: getCustomSettings()
    } as SettingsChangedMessage, 'config');
  }

  private onPanelDisposed() {
    if (this.disposablePanel) {
      this.disposablePanel.dispose();
    }

    this.panel = undefined;
  }

  private onViewStateChanged(event: WebviewPanelOnDidChangeViewStateEvent) {
    console.log('WebviewEditor.onViewStateChanged', event.webviewPanel.visible);

    if (!this.invalidateOnVisible || !event.webviewPanel.visible) {
      return;
    }

    // Update the view since it can be outdated
    const invalidContext = this.invalidateOnVisible;
    this.invalidateOnVisible = undefined;

    switch (invalidContext) {
      case 'config':
        // Post the new configuration to the view
        return this.postUpdatedConfiguration();
      default:
        return this.show();
    }
  }

  protected async onMessageReceived(event: Message) {
    if (event === null) {
      return;
    }

    console.log(`WebviewEditor.onMessageReceived: type=${event.type}, data=${JSON.stringify(event)}`);

    switch (event.type) {
      case 'saveSettings':
        // TODO: update settings
        return;

      default:
        return;
    }
  }

  async show(): Promise<void> {
    const html = await this.getHtml();

    // If panel already opened just reveal
    if (this.panel !== undefined) {
      this.panel.webview.html = html;
      return this.panel.reveal(ViewColumn.Active);
    }

    this.panel = window.createWebviewPanel(
      this.id,
      this.title,
      ViewColumn.Active,
      {
        retainContextWhenHidden: true,
        enableFindWidget: true,
        enableCommandUris: true,
        enableScripts: true
      }
    );

    // Applying listeners
    this.disposablePanel = Disposable.from(
      this.panel,
      this.panel.onDidDispose(this.onPanelDisposed, this),
      this.panel.onDidChangeViewState(this.onViewStateChanged, this),
      this.panel.webview.onDidReceiveMessage(this.onMessageReceived, this)
    );

    this.panel.webview.html = html;
  }
}
