import {
    IPHONE_X_DEFAULT_HOME_BAR,
    IPHONE_X_LARGE_HOME_BAR,
    NAVIGATION_BAR_SELECTORS,
    STATUS_BAR_SELECTORS,
} from '../helpers/constants'
import { multiplyIosObjectValuesAgainstDPR } from '../helpers/utils'
import { getDeviceInfo } from './getDeviceInfo'
import { nativeAppCompareLog } from '../helpers/logger'

let NAVIGATION_BAR_DIMENSIONS = null
let STATUS_BAR_DIMENSIONS = null

/**
 * Determine the ignore rectangles
 *
 * @param {string}  base64Image
 * @param {object}  options
 *
 * @return {Promise<Array>}
 */
export async function determineIgnoreRectangles(base64Image, options) {
    let rectangles = []
    let allowInvisibleElements
    const deviceInfo = await getDeviceInfo(base64Image)

    // With Android and UiAutomator2 the status bar is not in the view by default
    // It can be seen when {settings: {allowInvisibleElements: true}} is set
    // See http://appium.io/docs/en/advanced-concepts/settings/
    if (browser.isAndroid && (options.blockOutStatusBar || options.blockOutNavigationBar || options.elementBlockOuts.length > 0)) {
        allowInvisibleElements = (await browser.getSettings()).allowInvisibleElements
        await browser.updateSettings({ allowInvisibleElements: true })
    }

    if (options.blockOutStatusBar) {
        rectangles.push(await determineStatusBarRectangles(deviceInfo.dpr, deviceInfo.screenshotWidth))
    }

    if (browser.isAndroid && options.blockOutNavigationBar) {
        rectangles.push(await determineNavigationBarRectangles(deviceInfo.dpr, deviceInfo.screenshotWidth))
    }

    if (options.blockOuts.length > 0) {
        rectangles = rectangles.concat(determineValidBlockOuts(options.blockOuts))
    }

    if (options.elementBlockOuts.length > 0) {
        rectangles = rectangles.concat(await determineElementBlockOuts(options.elementBlockOuts, deviceInfo))
    }

    if (deviceInfo.isIphoneXSeries && options.blockOutIphoneXBottomBar) {
        rectangles = rectangles.concat(deviceInfo.isLargeIphoneXSeries ? IPHONE_X_LARGE_HOME_BAR : IPHONE_X_DEFAULT_HOME_BAR)
    }

    if (browser.isAndroid && (options.blockOutStatusBar || options.blockOutNavigationBar || options.elementBlockOuts.length > 0)) {
        await browser.updateSettings({ allowInvisibleElements })
    }

    return rectangles
}

/**
 * Determine the status bar height for iOS/Android
 *
 * @param {number} dpr The device pixel ratio
 *
 * @return {Promise<{
 *      bottom: number,
 *      right: number,
 *      left: number,
 *      top: number
 * }>}
 */
export async function determineStatusBarRectangles(dpr, width) {
    if (STATUS_BAR_DIMENSIONS) {
        return STATUS_BAR_DIMENSIONS
    }

    let rectangles

    try {
        rectangles = await getElementRectangles(await ($(STATUS_BAR_SELECTORS[ browser.isIOS ? 'IOS' : 'ANDROID' ])))
    } catch (e) /* istanbul ignore next */ {
        nativeAppCompareLog.warn('The statusbar could not be determined and has been set to the defaults!\n')

        //@TODO: default to an Android or iOS (iPhone (X)) height
        rectangles = { bottom: 26, right: width, left: 0, top: 0 }
    }

    STATUS_BAR_DIMENSIONS = multiplyIosObjectValuesAgainstDPR({
        bottom: rectangles.height,
        right: rectangles.width,
        left: 0,
        top: 0
    }, dpr)

    return STATUS_BAR_DIMENSIONS
}

/**
 * Determine the navigation bar height for iOS/Android
 *
 * @param {number} dpr The device pixel ratio
 *
 * @return {Promise<{
 *      bottom: number,
 *      right: number,
 *      left: number,
 *      right: number
 * }>}
 */
export async function determineNavigationBarRectangles(dpr, width) {
    if (NAVIGATION_BAR_DIMENSIONS) {
        return NAVIGATION_BAR_DIMENSIONS
    }

    let rectangles

    try {
        rectangles = await getElementRectangles(await $(NAVIGATION_BAR_SELECTORS.ANDROID))
    } catch (e) /* istanbul ignore next */ {
        nativeAppCompareLog.warn('The navigation bar could not be determined and has been set to the defaults!\n')

        rectangles = { bottom: 0, right: 0, left: 0, top: 0 }
    }

    NAVIGATION_BAR_DIMENSIONS = multiplyIosObjectValuesAgainstDPR({
        bottom: rectangles.height,
        right: width,
        left: rectangles.x,
        top: rectangles.y
    }, dpr)

    return NAVIGATION_BAR_DIMENSIONS
}

/**
 * Determine if the block outs are valid
 *
 * @param {array}   blockOuts
 *
 * @return {[{
 *      height: number,
 *      width: number,
 *      x: number,
 *      y: number
 * }]}
 */
export function determineValidBlockOuts(blockOuts) {
    const dimensions = []
    const validKeys = [ 'x', 'y', 'width', 'height' ]

    blockOuts.forEach(blockOut => {
        let validBlockOutObject = true
        Object.keys(blockOut).forEach(key => {
            if (!validKeys.includes(key)) {
                nativeAppCompareLog.error(`
###################################################
 Blockout:
 ${ JSON.stringify(blockOut) }

 is not allowed. Key: ${ key } is not allowed, 
 only 'x', 'y', 'width', 'height' are allowed
###################################################
`)
                validBlockOutObject = false
            }
        })

        if (validBlockOutObject) {
            dimensions.push({
                bottom: blockOut.height,
                right: blockOut.width,
                left: blockOut.x,
                top: blockOut.y,
            })
        }
    })

    return dimensions
}

/**
 * Determine the element block out data
 *
 * @param {array}   components
 * @param {object}  deviceInfo the device info object
 *
 * @return {Promise<[{
 *      height: number,
 *      width: number,
 *      x: number,
 *      y: number
 * }]>}
 */
export async function determineElementBlockOuts(components, deviceInfo) {
    const dimensions = []

    for (let component of components) {
        const selector = await component.element.selector
        // By providing elementNumber a specific element from the element array will be used
        const hasNumber = component.hasOwnProperty('elementNumber')

        try {
            const elements = hasNumber ? [ (await ($$(selector)))[ component.elementNumber ] ] : (await ($$(selector)))
            const margin = component.margin || 0

            for (let element of elements) {
                const rectangles = await getElementRectangles(element)
                dimensions.push(determineDimensions(rectangles, margin))
            }
        } catch (e) /* istanbul ignore next */ {
            nativeAppCompareLog.warn(`Something went wrong with finding / determining the rectangles of the element with selector: '${ selector }'.`)
            nativeAppCompareLog.warn('This error has been catched and shown below, but the test did not brake based on this error')
            nativeAppCompareLog.warn('\n', e, '\n')

        }
    }


    return dimensions.map(dimension => multiplyIosObjectValuesAgainstDPR(dimension, deviceInfo.dpr))
}

/**
 * Determine the dimensions
 *
 * @param {object} rectangles   An object with height, width,x and y
 * @param {number} margin       The margin that needs to be used
 *
 * @return {{
 *      height: number,
 *      width: number,
 *      x: number,
 *      y: number
 * }}
 */
export function determineDimensions(rectangles, margin) {
    return {
        bottom: rectangles.height + (2 * margin),
        right: rectangles.width + (2 * margin),
        left: rectangles.x - margin,
        top: rectangles.y - margin,
    }
}

/**
 * Get the rectangles of an element
 *
 * @param {object}  element
 * @return {Promise<{
 *      height: number,
 *      width: number,
 *      x: number,
 *      y: number
 * }>}
 */
export async function getElementRectangles(element) {
    return (await (browser.getElementRect(element.elementId)))
}
