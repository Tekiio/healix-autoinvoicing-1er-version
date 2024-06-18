/**
 * @NApiVersion 2.1
 */
define([],
    function () {
        const UI = {};
        UI.TABS = {};
        UI.TABS.CONTENT = {
            0: {
                class: '',
                value: 'WeInfuse Usage',
                clientPath: '/SuiteScripts/TKO - USAGE ROUTES',
                scriptId: 'customscript_tko_usage_view_sl',
                deployId: 'customdeploy_tko_usage_view_sl',
                functionName: 'toRoute'
            },
            1: {
                class: '',
                value: 'Ascend Reconcilation',
                clientPath: '/SuiteScripts/TKO - USAGE ROUTES',
                scriptId: 'customscript_tko_ascend_view_sl',
                deployId: 'customdeploy_tko_ascend_view_sl',
                functionName: 'toRoute'
            },
            2: {
                class: '',
                value: 'Services Import',
                clientPath: '/SuiteScripts/TKO - USAGE ROUTES',
                scriptId: 'customscript_tko_service_view_sl',
                deployId: 'customdeploy_tko_service_view_sl',
                functionName: 'toRoute'
            },
            3: {
                class: '',
                value: 'Services Auto-invoicing',
                clientPath: '/SuiteScripts/TKO - USAGE ROUTES',
                scriptId: 'customscript_fb_autoinv_from_stgng_sl',
                deployId: 'customdeploy_fb_autoinv_from_stgng_sl',
                functionName: 'toRoute'
            },
            4: {
                class: '',
                value: 'Auto-invoicing usage',
                clientPath: '/SuiteScripts/TKO - USAGE ROUTES',
                scriptId: '',
                deployId: '',
                functionName: 'toRoute'
            }
        }
        return {UI};
    }
);