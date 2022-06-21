/**
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Protocol} from 'devtools-protocol';
import {Browser, BrowserContext, IsPageTargetCallback} from './Browser';
import {CDPSession} from './Connection';
import {Page, PageEmittedEvents} from './Page';
import {Viewport} from './PuppeteerViewport';
import {TaskQueue} from './TaskQueue';

/**
 * @public
 */
export class Target {
	#browserContext: BrowserContext;
	#targetInfo: Protocol.Target.TargetInfo;
	#sessionFactory: () => Promise<CDPSession>;
	#ignoreHTTPSErrors: boolean;
	#defaultViewport: Viewport;
	#pagePromise?: Promise<Page>;
	#screenshotTaskQueue: TaskQueue;

	/**
	 * @internal
	 */
	_initializedPromise: Promise<boolean>;
	/**
	 * @internal
	 */
	_initializedCallback!: (x: boolean) => void;
	/**
	 * @internal
	 */
	_isClosedPromise: Promise<void>;
	/**
	 * @internal
	 */
	_closedCallback!: () => void;
	/**
	 * @internal
	 */
	_isInitialized: boolean;
	/**
	 * @internal
	 */
	_targetId: string;
	/**
	 * @internal
	 */
	_isPageTargetCallback: IsPageTargetCallback;

	/**
	 * @internal
	 */
	constructor(
		targetInfo: Protocol.Target.TargetInfo,
		browserContext: BrowserContext,
		sessionFactory: () => Promise<CDPSession>,
		ignoreHTTPSErrors: boolean,
		defaultViewport: Viewport,
		screenshotTaskQueue: TaskQueue,
		isPageTargetCallback: IsPageTargetCallback
	) {
		this.#targetInfo = targetInfo;
		this.#browserContext = browserContext;
		this._targetId = targetInfo.targetId;
		this.#sessionFactory = sessionFactory;
		this.#ignoreHTTPSErrors = ignoreHTTPSErrors;
		this.#defaultViewport = defaultViewport;
		this.#screenshotTaskQueue = screenshotTaskQueue;
		this._isPageTargetCallback = isPageTargetCallback;
		this._initializedPromise = new Promise<boolean>((fulfill) => {
			this._initializedCallback = fulfill;
		}).then(async (success) => {
			if (!success) {
				return false;
			}

			const opener = this.opener();
			if (!opener || !opener.#pagePromise || this.type() !== 'page') {
				return true;
			}

			const openerPage = await opener.#pagePromise;
			if (!openerPage.listenerCount(PageEmittedEvents.Popup)) {
				return true;
			}

			const popupPage = await this.page();
			openerPage.emit(PageEmittedEvents.Popup, popupPage);
			return true;
		});
		this._isClosedPromise = new Promise<void>((fulfill) => {
			this._closedCallback = fulfill;
		});
		this._isInitialized =
			!this._isPageTargetCallback(this.#targetInfo) ||
			this.#targetInfo.url !== '';
		if (this._isInitialized) {
			this._initializedCallback(true);
		}
	}

	/**
	 * Creates a Chrome Devtools Protocol session attached to the target.
	 */
	createCDPSession(): Promise<CDPSession> {
		return this.#sessionFactory();
	}

	/**
	 * @internal
	 */
	_getTargetInfo(): Protocol.Target.TargetInfo {
		return this.#targetInfo;
	}

	/**
	 * If the target is not of type `"page"` or `"background_page"`, returns `null`.
	 */
	async page(): Promise<Page | null> {
		if (this._isPageTargetCallback(this.#targetInfo) && !this.#pagePromise) {
			this.#pagePromise = this.#sessionFactory().then((client) => {
				return Page._create(
					client,
					this,
					this.#ignoreHTTPSErrors,
					this.#defaultViewport ?? null,
					this.#screenshotTaskQueue
				);
			});
		}

		return (await this.#pagePromise) ?? null;
	}

	url(): string {
		return this.#targetInfo.url;
	}

	/**
	 * Identifies what kind of target this is.
	 *
	 * @remarks
	 *
	 * See {@link https://developer.chrome.com/extensions/background_pages | docs} for more info about background pages.
	 */
	type():
		| 'page'
		| 'background_page'
		| 'service_worker'
		| 'shared_worker'
		| 'other'
		| 'browser'
		| 'webview' {
		const {type} = this.#targetInfo;
		if (
			type === 'page' ||
			type === 'background_page' ||
			type === 'service_worker' ||
			type === 'shared_worker' ||
			type === 'browser' ||
			type === 'webview'
		) {
			return type;
		}

		return 'other';
	}

	/**
	 * Get the browser the target belongs to.
	 */
	browser(): Browser {
		return this.#browserContext.browser();
	}

	/**
	 * Get the browser context the target belongs to.
	 */
	browserContext(): BrowserContext {
		return this.#browserContext;
	}

	/**
	 * Get the target that opened this target. Top-level targets return `null`.
	 */
	opener(): Target | undefined {
		const {openerId} = this.#targetInfo;
		if (!openerId) {
			return;
		}

		return this.browser()._targets.get(openerId);
	}

	/**
	 * @internal
	 */
	_targetInfoChanged(targetInfo: Protocol.Target.TargetInfo): void {
		this.#targetInfo = targetInfo;

		if (
			!this._isInitialized &&
			(!this._isPageTargetCallback(this.#targetInfo) ||
				this.#targetInfo.url !== '')
		) {
			this._isInitialized = true;
			this._initializedCallback(true);
		}
	}
}