/* Updated from: https://github.com/MetaMask/controllers/blob/15129ad48fd1390492482c45941bd948ea596e5d/src/BaseController.ts */

/**
 * State change callbacks
 */
export type Listener<T> = (state: T, resetting?: boolean) => Promise<void>;

/**
 * @type BaseConfig
 *
 * Base controller configuration
 * @property disabled - Determines if this controller is enabled
 */
export interface BaseConfig { }

/**
* @type BaseState
*
* Base state representation
* @property name - Unique name for this controller
*/
export interface BaseState { }

/**
 * Controller class that provides configuration, state management, and subscriptions
 */
export default class BaseController<C extends BaseConfig, S extends BaseState> {
    /**
     * Default options used to configure this controller
     */
    defaultConfig: C = {} as C;

    /**
     * Default state set on this controller
     */
    defaultState: S = {} as S;

    private readonly initialConfig: C;

    private readonly initialState: S;

    private internalConfig: C = this.defaultConfig;

    private internalState: S = this.defaultState;

    private internalListeners: Listener<S>[] = [];


    /**
    * Creates a BaseController instance. Both initial state and initial
    * configuration options are merged with defaults upon initialization.
    *
    * @param config - Initial options used to configure this controller.
    * @param state - Initial state to set on this controller.
    */
    constructor(config: Partial<C> = {} as C, state: Partial<S> = {} as S) {
        // Use assign since generics can't be spread: https://git.io/vpRhY
        this.initialState = state as S;
        this.initialConfig = config as C;
    }

    /**
   * Enables the controller. This sets each config option as a member
   * variable on this instance and triggers any defined setters. This
   * also sets initial state and triggers any listeners.
   *
   * @returns This controller instance.
   */
    protected initialize() {
        this.internalState = this.defaultState;
        this.internalConfig = this.defaultConfig;
        this.configure(this.initialConfig);
        this.update(this.initialState);
        return this;
    }

    /**
     * Retrieves current controller configuration options.
     *
     * @returns The current configuration.
     */
    get config() {
        return this.internalConfig;
    }

    /**
     * Retrieves current controller state.
     *
     * @returns The current state.
     */
    get state() {
        return this.internalState;
    }

    /**
     * Updates controller configuration.
     *
     * @param config - New configuration options.
     * @param overwrite - Overwrite config instead of merging.
     * @param fullUpdate - Boolean that defines if the update is partial or not.
     */
    configure(config: Partial<C>, overwrite = false, fullUpdate = true) {
        if (fullUpdate) {
            this.internalConfig = overwrite
                ? (config as C)
                : Object.assign(this.internalConfig, config);

            for (const key in this.internalConfig) {
                if (typeof this.internalConfig[key] !== 'undefined') {
                    /* eslint-disable-next-line */
                    (this as any)[key as string] = this.internalConfig[key];
                }
            }
        } else {
            for (const key in config) {
                /* istanbul ignore else */
                if (typeof this.internalConfig[key] !== 'undefined') {
                    /* eslint-disable-next-line */
                    this.internalConfig[key] = config[key] as any;
                    /* eslint-disable-next-line */
                    (this as any)[key as string] = config[key];
                }
            }
        }
    }

    /**
     * Notifies all subscribed listeners of current modified state.
     */
    async notify(state: S, resetting = false) {
        const promises: Promise<void>[] = [];
        this.internalListeners.forEach(listener => {
            promises.push(listener(state, resetting));
        });
        await Promise.all(promises)
    }

    /**
     * Adds new listener to be notified of state changes.
     *
     * @param listener - The callback triggered when state changes.
     */
    subscribe(listener: Listener<S>) {
        this.internalListeners.push(listener);
    }

    /**
     * Removes existing listener from receiving state changes.
     *
     * @param listener - The callback to remove.
     * @returns `true` if a listener is found and unsubscribed.
     */
    unsubscribe(listener: Listener<S>) {
        const index = this.internalListeners.findIndex(cb => listener === cb);
        index > -1 && this.internalListeners.splice(index, 1);
        return index > -1;
    }

    /**
     * Updates controller state.
     *
     * @param state - The new state.
     * @param overwrite - Overwrite state instead of merging.
     */
    async update(state: Partial<S>, overwrite = false, resetting = false) {
        this.internalState = overwrite
            ? Object.assign({}, state as S)
            : Object.assign({}, this.internalState, state);
        await this.notify(this.internalState, resetting);
    }

    /**
     * Resets controller state to default.
     */
    reset() {
        this.update(this.defaultState, true, true);
    };
}