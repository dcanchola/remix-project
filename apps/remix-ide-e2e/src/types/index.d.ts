// Merge custom command types with nightwatch types

import { NightwatchBrowser, NightwatchBrowser, NightwatchBrowser } from "nightwatch";

declare module "nightwatch" {
    export interface NightwatchCustomCommands {
        clickLaunchIcon(icon: string): NightwatchBrowser,
        switchBrowserTab(index: number): NightwatchBrowser,
        scrollAndClick(target: string): NightwatchBrowser,
        scrollInto(target: string): NightwatchBrowser,
        testContracts(fileName: string, contractCode: NightwatchContractContent, compiledContractNames: string[]): NightwatchBrowser,
        setEditorValue(value: string, callback?: () => void): NightwatchBrowser,
        addFile(name: string, content: NightwatchContractContent): NightwatchBrowser,
        verifyContracts(compiledContractNames: string[]): NightwatchBrowser,
        selectAccount(account?: string): NightwatchBrowser,
        clickFunction(fnFullName: string, expectedInput?: NightwatchClickFunctionExpectedInput): NightwatchBrowser,
        testFunction(txHash: string, expectedInput: NightwatchTestFunctionExpectedInput): NightwatchBrowser,
        goToVMTraceStep(step: number, incr?: number): NightwatchBrowser,
        checkVariableDebug(id: string, debugValue: NightwatchCheckVariableDebugValue): NightwatchBrowser,
        addAtAddressInstance(address: string, isValidFormat: boolean, isValidChecksum: boolean): NightwatchBrowser,
        modalFooterOKClick(): NightwatchBrowser,
        clickInstance(index: number): NightwatchBrowser,
        journalLastChildIncludes(val: string): NightwatchBrowser
    }

    export interface NightwatchBrowser {
        api: this,
        emit: (status: string) => void,
        fullscreenWindow: (result?: any) => this
    }

    export interface NightwatchContractContent {
        content: string;
    }

    export interface NightwatchVerifyContractOpts {
        wait: number, 
        version?: string
    }

    export interface NightwatchClickFunctionExpectedInput {
        types: string,
        values: string
    }

    export interface NightwatchTestFunctionExpectedInput {
        [key: string]: any
    }

    export type NightwatchCheckVariableDebugValue = NightwatchTestFunctionExpectedInput
}