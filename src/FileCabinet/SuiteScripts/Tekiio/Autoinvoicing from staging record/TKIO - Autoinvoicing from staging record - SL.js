/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
/**
* @name TKIO - Autoinvoicing from staging record 
* @version 1.0
* @author Ricardo López <ricardo.lopez@freebug.mx>
* @summary Descripción
* @copyright Tekiio México 2022
* 
* Client       -> Cliente
* Last modification  -> Fecha
* Modified by     -> Ricardo López <ricardo.lopez@freebug.mx>
* Script in NS    -> Registro en Netsuite <ID del registro>
*/
define(['N/ui/serverWidget', 'N/search', 'N/http', 'N/file', 'N/record', 'N/runtime', 'N/xml', 'N/render',
    'N/redirect', 'N/encode', 'N/https', 'N/format', 'N/task', 'N/url', 'SuiteScripts/Staging Record/Libs/view_lib.js'], (serverWidget, search, http, file, record, runtime, xml, render, redirect, encode, https, format, task, url, viewLib) => {

        var PAGE_SIZE = 1000;

        const { UI } = viewLib
        const SCRIPT_MAPREDUCE = {};
        SCRIPT_MAPREDUCE.SCRIPTID = 'customscript_fb_autoinv_from_stgng_mr';
        SCRIPT_MAPREDUCE.DEPLOYID = 'customdeploy_fb_autoinv_from_stgng_mr';

        const SCRIPT_TRACKING = {};
        SCRIPT_TRACKING.SCRIPTID = 'customscript_fb_autoinv_from_stgng_tk_sl';
        SCRIPT_TRACKING.DEPLOYID = 'customdeploy_fb_autoinv_from_stgng_tk_sl';

        const TRACKING_RECORD = {};
        TRACKING_RECORD.ID = 'customrecord_tkio_staging_trancking_rcd';

        const ERRORS_DETAIL = {
            'NOTLOT': 'The staging does not have the LOT field',
            'NOTSERIAL': 'For the item there is no SERIAL/LOT NUMBER with the LOT',
            'NOTMATCHUNIT': 'The lot does not have the same units as the item',
            'NOTUNIT': 'The staging does not have the units',
            'LOWPRICE': 'The staging price must be greater than 0',
            'LOWQTY': 'The lot does not have enough quantity for this transaction',
            'INSQTY': 'The staging quantity must be greater than 0',
            'NOTMATCHSUB': 'Customer and location do not correspond to the same subsidiary',
        }

        /**
         * Defines the Suitelet script trigger point.
         * @param {Object} scriptContext
         * @param {ServerRequest} scriptContext.request - Incoming request
         * @param {ServerResponse} scriptContext.response - Suitelet response
         * @since 2015.2
         */
        const onRequest = (scriptContext) => {
            try {
                let method = scriptContext.request.method;
                log.audit({ title: 'scriptContext.request', details: scriptContext.request });
                log.audit({ title: 'Method', details: method });

                // Depends on the usage method the interface is created
                switch (method) {
                    case 'GET':
                        //if exist status (process in MapReduce)
                        if (scriptContext.request.parameters.hasOwnProperty('statusPage') && scriptContext.request.parameters.statusPage) {
                            createPanel(scriptContext, serverWidget, search);
                        } else {
                            // List the tracking for staging values ( )
                            createPanel(scriptContext, serverWidget, search);
                        }
                        break;
                    case 'POST':
                        var pageId = scriptContext.request.parameters.custpage_pageid;
                        var stDate = scriptContext.request.parameters.custpage_sd;
                        var ed_Date = scriptContext.request.parameters.custpage_ed;
                        var checkall = scriptContext.request.parameters.custpage_checkall;
                        var uncheckall = scriptContext.request.parameters.custpage_uncheckall;
                        var custpage_staging_ids = scriptContext.request.parameters.custpage_staging_ids;
                        var customer_in = scriptContext.request.parameters.custpage_customer ? scriptContext.request.parameters.custpage_customer : null;

                        var employee = runtime.getCurrentUser();
                        var employeeId = employee.id;
                        // Get lines selected
                        log.audit({ title: 'Parameters:', details: { stDate, ed_Date, checkall, uncheckall, custpage_staging_ids, customer_in } });
                        let dataResults = getStagingRecords(PAGE_SIZE, stDate, ed_Date, customer_in, null)
                        let checksId = custpage_staging_ids.split(',');
                        let lines = dataResults[0];
                        let stagingForSend = [];
                        lines.forEach(stagingPib => {
                            if (checksId.includes(stagingPib.id) && uncheckall === 'T') {
                                stagingForSend.push(stagingPib.id)
                            }
                            if (!checksId.includes(stagingPib.id) && checkall === 'T') {
                                stagingForSend.push(stagingPib.id)
                            }
                        });
                        // Data to send at MapReduce
                        log.audit({ title: 'Data for MapReduce: ', details: stagingForSend });
                        if (stagingForSend.length > 0) {
                            // Create tracking record
                            let trackingRecord = record.create({ type: TRACKING_RECORD.ID, isDynamic: true });
                            let trackingRecordId = trackingRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });

                            // Run the MapReduce, automatic generation of invoices
                            var mapReduceTask = task.create({
                                taskType: task.TaskType.MAP_REDUCE,
                                scriptId: SCRIPT_MAPREDUCE.SCRIPTID,
                                deploymentId: SCRIPT_MAPREDUCE.DEPLOYID,
                                params: {
                                    custscript_tkio_ids_staging_mr: JSON.stringify(stagingForSend),
                                    custscript_tkio_tracking_record: trackingRecordId,
                                }
                            }).submit();
                            log.debug({ title: 'mapReduceTask', details: mapReduceTask });

                            // Add the idTask and employee to the tracking record
                            record.submitFields({
                                type: TRACKING_RECORD.ID,
                                id: trackingRecordId,
                                values: {
                                    custrecord_tkio_staging_task_id_mr: mapReduceTask,
                                    custrecord_tkio_staging_employee: employeeId
                                },
                                options: {
                                    enablesourcing: false,
                                    ignoreMandatotyFields: true
                                }
                            });
                            // Redirect to suitelet for check the process status
                            redirect.toSuitelet({
                                scriptId: scriptContext.request.parameters.script,
                                deploymentId: scriptContext.request.parameters.deploy,
                                parameters: {
                                    'statusPage': true,
                                    'mapReduceTask': mapReduceTask,
                                    'trackingRecordId': trackingRecordId
                                }
                            });
                        } else {
                            redirect.toSuitelet({
                                scriptId: scriptContext.request.parameters.script,
                                deploymentId: scriptContext.request.parameters.deploy,
                                parameters: {
                                    'not_results': true
                                }
                            });
                        }
                        break;
                }
            } catch (e) {
                log.error({ title: 'Error onRequest:', details: e });
            }
        }
        function createPanel(context, serverWidget, search) {
            try {

                var form = serverWidget.createForm({ title: 'Autoinvoicing from Staging Record', hideNavBar: false });
                form.clientScriptModulePath = './TKIO - Autoinvoicing from staging record - CS';
                // Get parameters
                var pageId = parseInt(context.request.parameters.page) || 0;
                var stDate = context.request.parameters.stDate;
                var ed_Date = context.request.parameters.edDate;
                var customer = context.request.parameters.customer_in;
                var checkall = context.request.parameters.checkall;
                var unCheckall = context.request.parameters.uncheckall;
                var idsStaging = context.request.parameters.idStaging;

                log.audit({ title: 'Parametros:', details: { pageId: pageId, stDate: stDate, ed_Date: ed_Date, customer: customer, checkall: checkall, unCheckall: unCheckall, idsStaging: idsStaging } });

                // Add the hotbar to redirect more actions ( Modules)
                form.addField({ id: 'custpage_tabs_view', label: ' ', type: serverWidget.FieldType.INLINEHTML, source: '', container: '' }).defaultValue = `
                    <style> 
                        div#body div#div__body {
                        margin-top: 65px !important;
                        }
                        .uir-page-title {
                        display: none !important;
                        }
                        .container_custom {
                        padding: 1rem;
                        min-width: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        }
                        .container_custom > input {
                        font-size: 22px;
                        font-weight: bold;
                        color: #4d5f79;
                        line-height: 33px;
                        }
                        .tabs {
                        border-bottom: 0.5px solid #dbdbdb;
                        width: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: space-around;
                    }
                    .tabs input {
                        padding: 1em;
                        font-size: 11pt;
                        font-weight: bold;
                        border-radius: 0.375em 0.375em 0 0;
                        border: 1px solid transparent;
                        min-width: 20vw;
                        height: 45px;
                        cursor: pointer;
                        background-color: #f0f0f0;
                        color: #7c7c7c;
                    }
                    .tabs input.is-active {
                        background-color: #3e8ed0;
                        border-color: #dbdbdb;
                        border-bottom-color: transparent !important;
                        color: #fff;
                    }
                    .tabs input:hover {
                        background-color: #eff5fb;
                        color: #3e8ed0;
                        border-bottom-color: #dbdbdb;
                    }
                    </style>
                    <div class="container_custom">
                        <div class="tabs">
                        <input  type="button" value="WeInfuse Usage" id="custpage_cust_action" name="custpage_cust_action" onclick="var  rConfig =  JSON.parse( '{}' ) ; rConfig['context'] = '/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'; var entryPointRequire = require.config(rConfig); entryPointRequire(['/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'], function(mod){ try{    if (!!window)    {        var origScriptIdForLogging = window.NLScriptIdForLogging;        var origDeploymentIdForLogging = window.NLDeploymentIdForLogging;        window.NLScriptIdForLogging = 'customscript_tkio_reconcile_ascend_sl';        window.NLDeploymentIdForLogging = 'customdeploy_view_main';    }mod.goToList();}finally{    if (!!window)    {        window.NLScriptIdForLogging = origScriptIdForLogging;        window.NLDeploymentIdForLogging = origDeploymentIdForLogging;    }} }); return false;">

                        <input type="button" value="Ascend Reconcilation" id="custpage_cust_action" name="custpage_cust_action" onclick="var  rConfig =  JSON.parse( '{}' ) ; rConfig['context'] = '/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'; var entryPointRequire = require.config(rConfig); entryPointRequire(['/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'], function(mod){ try{    if (!!window)    {        var origScriptIdForLogging = window.NLScriptIdForLogging;        var origDeploymentIdForLogging = window.NLDeploymentIdForLogging;        window.NLScriptIdForLogging = 'customscript_tkio_reconcile_ascend_sl';        window.NLDeploymentIdForLogging = 'customdeploy_view_main';    }mod.toReconcilie();}finally{    if (!!window)    {        window.NLScriptIdForLogging = origScriptIdForLogging;        window.NLDeploymentIdForLogging = origDeploymentIdForLogging;    }} }); return false;">

                        <input type="button" value="Services Import" id="custpage_cust_action" name="custpage_cust_action" onclick="var  rConfig =  JSON.parse( '{}' ) ; rConfig['context'] = '/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'; var entryPointRequire = require.config(rConfig); entryPointRequire(['/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'], function(mod){ try{    if (!!window)    {        var origScriptIdForLogging = window.NLScriptIdForLogging;        var origDeploymentIdForLogging = window.NLDeploymentIdForLogging;        window.NLScriptIdForLogging = 'customscript_tkio_reconcile_ascend_sl';        window.NLDeploymentIdForLogging = 'customdeploy_view_main';    }mod.toServices();}finally{    if (!!window)    {        window.NLScriptIdForLogging = origScriptIdForLogging;        window.NLDeploymentIdForLogging = origDeploymentIdForLogging;    }} }); return false;">

                        <input class="is-active" type="button" value="Auto-invoicing" id="custpage_cust_action" name="custpage_cust_action" onclick="var  rConfig =  JSON.parse( '{}' ) ; rConfig['context'] = '/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'; var entryPointRequire = require.config(rConfig); entryPointRequire(['/SuiteScripts/Staging Record/TKIO - UPLOAD ASCEND CS'], function(mod){ try{    if (!!window)    {        var origScriptIdForLogging = window.NLScriptIdForLogging;        var origDeploymentIdForLogging = window.NLDeploymentIdForLogging;        window.NLScriptIdForLogging = 'customscript_tkio_reconcile_ascend_sl';        window.NLDeploymentIdForLogging = 'customdeploy_view_main';    }mod.toInvoicing();}finally{    if (!!window)    {        window.NLScriptIdForLogging = origScriptIdForLogging;        window.NLDeploymentIdForLogging = origDeploymentIdForLogging;    }} }); return false;">
                        </div>
                    </div>`

                if ((context.request.parameters.hasOwnProperty('statusPage') && context.request.parameters.statusPage)) {

                    var taskID = context.request.parameters.mapReduceTask;
                    var trackingRecordId2 = context.request.parameters.trackingRecordId;

                    form.addFieldGroup({ id: 'custpage_group_message', label: 'Status' });
                    let messageCust = form.addField({ id: 'custpage_tabs_message', label: ' ', type: serverWidget.FieldType.INLINEHTML, source: '', container: 'custpage_group_message' });
                    const status = consultTask(taskID)
                    log.audit({ title: 'taskID', details: { taskID:taskID, status:status } });
                    if (status.status !== task.TaskStatus.COMPLETE && status.status !== task.TaskStatus.FAILED) {
                        let percent = 0
                        switch (status.stage) {
                            case task.MapReduceStage.GET_INPUT:
                                percent = 10
                                break
                            case task.MapReduceStage.MAP:
                                percent = 25
                                break
                            case task.MapReduceStage.SHUFFLE:
                                percent = 35
                                break
                            case task.MapReduceStage.REDUCE:
                                percent = 50
                                break
                            case task.MapReduceStage.SUMMARIZE:
                                percent = 90
                                break
                        }
                        UI.MESSAGES.PROCESSING.message += `<br> Stage: ${status.stage} Percent: ${percent}`
                        messageCust.defaultValue = showNotification(UI.MESSAGES.PROCESSING);
                    } else {
                        let urlRedirect = url.resolveScript({
                            deploymentId: SCRIPT_TRACKING.DEPLOYID,
                            scriptId: SCRIPT_TRACKING.SCRIPTID,
                            params: {
                                'statusPage': true,
                                'mapReduceTask': taskID,
                                'trackingRecordId': trackingRecordId2
                            }
                        })
                        UI.MESSAGES.COMPLETE_TASK.message += `Process completed successfully <br/> <a href=${urlRedirect}> View more details</a>`
                        messageCust.defaultValue = showNotification(UI.MESSAGES.COMPLETE_TASK);
                    }
                }
                //Add Buttons 
                form.addButton({ id: 'custpage_filter', label: 'Filter', functionName: 'get_Results();' });
                form.addSubmitButton({ id: 'custpage_process', label: 'Process' });
                form.addButton({ id: 'custpage_return_tracking', label: 'Go to Tracking record', functionName: 'returnToTracking();' });

                form.addFieldGroup({ id: 'custpage_filters_general', label: 'Filters' });
                //Add filters to search
                var stdate = form.addField({ id: 'custpage_sd', label: 'Start date', type: 'date', container: 'custpage_filters_general' });
                stdate.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
                var edDate = form.addField({ id: 'custpage_ed', label: 'End date', type: 'date', container: 'custpage_filters_general' });
                edDate.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
                var customer_in = form.addField({ id: 'custpage_customer', label: 'Customer', type: 'select', source: record.Type.CUSTOMER, container: 'custpage_filters_general' }).updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
                var selectOptions = form.addField({ id: 'custpage_pageid', label: 'Page', type: serverWidget.FieldType.SELECT, container: 'custpage_filters_general' }).updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
              var totalResults = form.addField({ id: 'custpage_results', label: 'Total of results', type: serverWidget.FieldType.TEXT, container: 'custpage_filters_general'});
              totalResults.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
              totalResults.updateDisplayType({displayType: serverWidget.FieldDisplayType.INLINE });

          

                // Auxiliary fields for pagination
                var idStaging = form.addField({ id: 'custpage_staging_ids', label: 'IDS Staging', type: serverWidget.FieldType.LONGTEXT }).updateDisplayType({ displayType: 'hidden' });
                var mark = form.addField({ id: 'custpage_checkall', label: 'Mark All', type: serverWidget.FieldType.CHECKBOX }).updateDisplayType({ displayType: 'hidden' });
                var dismark = form.addField({ id: 'custpage_uncheckall', label: 'Dismark All', type: serverWidget.FieldType.CHECKBOX }).updateDisplayType({ displayType: 'hidden' });
                dismark.defaultValue = 'T'

                //Validation the values from parameters
                if (stDate != null && stDate != '' && stDate != 'NaN')
                    stdate.defaultValue = stDate;
                if (ed_Date != null && ed_Date != '' && ed_Date != 'NaN')
                    edDate.defaultValue = ed_Date;
                if (customer != null && customer != '')
                    customer_in.defaultValue = customer;
                if (checkall != null)
                    mark.defaultValue = ((checkall === 'T' || checkall === true) ? 'T' : 'F');
                if (unCheckall != null)
                    dismark.defaultValue = ((unCheckall === 'T' || unCheckall === true) ? 'T' : 'F');
                if (idsStaging != null && idsStaging !== '') {
                    idStaging.defaultValue = idsStaging;
                    var idsChecks = idsStaging.split(',')
                }

                // Create the sublist for add the values
                var sublist = form.addSublist({ id: 'custpage_staging_list', type: serverWidget.SublistType.LIST, label: 'Stagings' });

                // Add columns to be shown on Page
                sublist.addField({ id: 'custpage_check', label: 'Check', type: serverWidget.FieldType.CHECKBOX });
                sublist.addField({ id: 'custpage_id', label: 'Id', type: serverWidget.FieldType.TEXT }).updateDisplayType({ displayType: 'hidden' });
                sublist.addField({ id: 'custpage_usage_id', label: 'Usage Id', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_item', label: 'Item', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_ndc', label: 'NDC', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_customer', label: 'Customer', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_date', label: 'Date', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_price', label: 'Rate', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_unit', label: 'Unit', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_qty', label: 'Quantity', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_amt', label: 'Amount', type: serverWidget.FieldType.TEXT });
                sublist.addButton({ id: 'custpage_check_all', label: 'Mark all', functionName: 'checkAll' });
                sublist.addButton({ id: 'custpage_uncheck_all', label: 'Dismark all', functionName: 'uncheckAll' });


                let dataSearch = getStagingRecords(PAGE_SIZE, stDate, ed_Date, customer, pageId);
                let resultsStaging = dataSearch[0]
              form.getField({id: 'custpage_results'}).defaultValue = dataSearch[1]||0
                log.audit({ title: 'resultsStagingAux', details: resultsStaging[resultsStaging.length - 1] });
                if (resultsStaging.length > 0) {
                    // Set data returned to columns
                    var j = 0;
                    // Add the values in the table
                    resultsStaging.forEach(function (result) {
                        // log.audit({ title: 'result', details: result });

                        // Valid if the id is in the pagination list
                        if (idsChecks) {
                            sublist.setSublistValue({ id: 'custpage_check', line: j, value: (checkall === 'T' ? (idsChecks.includes(result.id) ? 'F' : 'T') : (idsChecks.includes(result.id) ? 'T' : 'F')) });
                        } else {
                            sublist.setSublistValue({ id: 'custpage_check', line: j, value: (checkall && unCheckall ? (checkall === 'T' ? 'T' : 'F') : 'F') });
                        }
                        sublist.setSublistValue({ id: 'custpage_id', line: j, value: result.id });
                      const usageURL = resolveRecord(result.id, 'customrecord_staging')
                        sublist.setSublistValue({ id: 'custpage_usage_id', line: j, value: `<a href='${usageURL}' target='_blank'>${result.id}</a>` });
                        sublist.setSublistValue({ id: 'custpage_item', line: j, value: result.item.text });
                        sublist.setSublistValue({ id: 'custpage_ndc', line: j, value: result.ndc });
                        sublist.setSublistValue({ id: 'custpage_customer', line: j, value: result.customer });
                        sublist.setSublistValue({ id: 'custpage_date', line: j, value: result.date });
                        sublist.setSublistValue({ id: 'custpage_price', line: j, value: '$ ' + result.price });
                        sublist.setSublistValue({ id: 'custpage_unit', line: j, value: result.unit });
                        sublist.setSublistValue({ id: 'custpage_qty', line: j, value: result.qty });
                        sublist.setSublistValue({ id: 'custpage_amt', line: j, value: '$ ' + result.amt });
                        j++
                    });

                    let pageCount = Math.ceil(dataSearch[1] / PAGE_SIZE);
                    log.audit({ title: 'Paginacion', details: { NoPags: PAGE_SIZE, noResult: dataSearch[1], pageCount: pageCount } });
                    for (var i = 0; i < pageCount; i++) {
                        if (i == pageId) {
                            selectOptions.addSelectOption({ value: 'pageid_' + i, text: ('Page ' + ((i * PAGE_SIZE) + 1) + ' - ' + ((i + 1) * PAGE_SIZE)), isSelected: true });
                        } else {
                            selectOptions.addSelectOption({ value: 'pageid_' + i, text: ('Page ' + ((i * PAGE_SIZE) + 1) + ' - ' + ((i + 1) * PAGE_SIZE)) });
                        }
                    }
                }
                context.response.writePage(form);
            } catch (e) {
                log.error({ title: 'Error createPanel:', details: e });
            }
        }
        /**
         * The function consults the status of a task and returns information about its stage, pending output
         * count, percentage completed, and pending map and reduce counts.
         * @returns The function `consultTask` returns an object with the following properties:
         * - `stage`: the current stage of the task
         * - `pendingLines`: the number of pending output lines
         * - `percentTask`: the percentage of the task that has been completed
         * - `mapCount`: the number of pending map tasks
         * - `reduceCount`: the number of pending reduce tasks
         */
        const consultTask = taskId => {
            try {
                const statusTask = task.checkStatus({ taskId })
                const stage = statusTask.stage
                const status = statusTask.status
                const pendingLines = statusTask.getPendingOutputCount()
                const percentTask = statusTask.getPercentageCompleted()
                const mapCount = statusTask.getPendingMapCount()
                const reduceCount = statusTask.getPendingReduceCount()
                return { stage, pendingLines, percentTask, mapCount, reduceCount, status }
            } catch (err) {
                log.error('Error on consultTask', err)
            }
        }
        /**
   * The function `showNotification` generates a notification message based on the given type and
   * returns it.
   * @param {Object} msg Contains the notification structure
   * @param {String} msg.type The type of the notification
   * @param {String} msg.title The title message
   * @param {String} msg.message The body of message
   * @param {Number} msg.duration The duration of the notification
   * @returns The function `showNotification` returns a string that represents a notification message.
   */
        const showNotification = msg => {
            try {
                let notification = ''
                switch (msg.type) {
                    case 'confirmation':
                        notification = UI.NOTIFICATIONS.STYLE + UI.NOTIFICATIONS.SUCCESS + UI.NOTIFICATIONS.SCRIPT
                        break
                    case 'warning':
                        notification = UI.NOTIFICATIONS.STYLE + UI.NOTIFICATIONS.WARNING + UI.NOTIFICATIONS.SCRIPT
                        break
                    case 'information':
                        notification = UI.NOTIFICATIONS.STYLE + UI.NOTIFICATIONS.INFO + UI.NOTIFICATIONS.SCRIPT
                        break
                    case 'error':
                        notification = UI.NOTIFICATIONS.STYLE + UI.NOTIFICATIONS.ERROR + UI.NOTIFICATIONS.SCRIPT
                        break
                    default:
                        notification = UI.NOTIFICATIONS.STYLE + UI.NOTIFICATIONS.DEFAULT + UI.NOTIFICATIONS.SCRIPT
                        break
                }
                notification = notification.replace('{title}', msg.title)
                notification = notification.replace('{message}', msg.message)
                const duration = msg?.duration || 3000000
                notification = notification.replace('{duration}', duration)
                return notification
            } catch (err) {
                log.error('Error on showNotification', err)
            }
        }


        function getStagingRecords(searchPageSize, stDate, ed_Date, customer, selectOptions) {
            try {
                var filters = [

                    ["custrecord_staging_customer", search.Operator.NONEOF, "@NONE@"],
                    "AND",
                    ["custrecord_staging_location", search.Operator.NONEOF, "@NONE@"],
                    "AND",
                    ["custrecord_staging_item", search.Operator.NONEOF, "@NONE@"],
                    "AND",
                    ["custrecord_staging_transaction_created", search.Operator.ANYOF, "@NONE@"],
                    'AND',
                    ["custrecord_staging_item.subtype", search.Operator.NONEOF, "Purchase"],
                    'AND',
                    [["custrecord_staging_price", search.Operator.GREATERTHAN, 0], 'AND', ["custrecord_staging_price", search.Operator.ISNOTEMPTY, '']]
                ];
                var searchObj = search.create({
                    type: 'customrecord_staging',
                    columns: [
                        search.createColumn({ name: "internalid", label: "Internal ID" }),
                        search.createColumn({ name: "custrecord_staging_item", label: "Item" }),
                        search.createColumn({ name: "displayname", join: "CUSTRECORD_STAGING_ITEM", label: "Display Name" }),
                        search.createColumn({ name: "custrecord_staging_ndc", label: "NDC" }),
                        search.createColumn({ name: "custrecord_staging_customer", label: "Customer" }),
                        search.createColumn({ name: "custrecord_staging_date", label: "Date " }),
                        search.createColumn({ name: "custrecord_staging_price", label: "Price" }),
                        search.createColumn({ name: "custrecord_staging_unit", label: "Unit" }),
                        search.createColumn({ name: "custrecord_staging_quantity", label: "Quantity" })
                    ]
                })
                searchObj.filterExpression = filters;

                if (stDate != '' && stDate != null && ed_Date != '' && ed_Date != null) {
                    var stFilter = search.createFilter({ name: 'custrecord_staging_date', operator: 'within', values: [stDate, ed_Date] });
                    searchObj.filters.push(stFilter);
                }

                if (customer != '' && customer != null) {
                    var subfilter = search.createFilter({ name: 'custrecord_staging_customer', operator: search.Operator.ANYOF, values: [customer] });
                    searchObj.filters.push(subfilter);
                }

                var searchResultCount = searchObj.runPaged().count;
                var dataResults = searchObj.runPaged({ pageSize: searchPageSize });

                log.audit({ title: 'Filtros', details: searchObj.filters });
                var results = new Array();

                // Obtain the data for page
                if (selectOptions !== null) {
                    var searchPage = dataResults.fetch({ index: selectOptions });
                    searchPage.data.forEach(function (result) {
                        let id = result.getValue({ name: 'internalid' }) || ' ';
                        let item = {
                            value: result.getValue({ name: 'custrecord_staging_item' }),
                            text: (result.getText({ name: 'custrecord_staging_item' }) || '') + ' ' + (result.getValue({ name: "displayname", join: "CUSTRECORD_STAGING_ITEM" }) || ''),
                        };
                        let ndc = result.getValue({ name: 'custrecord_staging_ndc' }) || ' ';
                        let customer = result.getText({ name: 'custrecord_staging_customer' }) || ' ';
                        let date = result.getValue({ name: 'custrecord_staging_date' }) || ' ';
                        let price = Number(result.getValue({ name: 'custrecord_staging_price' })).toFixed(2) || 0;
                        let unit = result.getText({ name: 'custrecord_staging_unit' }) || ' '// (result.getValue({ name: 'custrecord_staging_unit' })||' ');
                        let qty = Number(result.getValue({ name: 'custrecord_staging_quantity' })) || 0;
                        let amt = (qty * price).toFixed(2);
                        results.push({
                            id: id,
                            item: item,
                            ndc: ndc,
                            customer: customer,
                            date: date,
                            price: price,
                            unit: unit,
                            qty: qty,
                            amt: amt

                        });
                    })
                } else {
                    //Obtain the data for send at MapReduce
                    var thePageRanges = dataResults.pageRanges;
                    for (var i in thePageRanges) {
                        var searchPage = dataResults.fetch({ index: thePageRanges[i].index });
                        searchPage.data.forEach(function (result) {
                            let id = result.getValue({ name: 'internalid' }) || ' ';
                            let item = {
                                value: result.getValue({ name: 'custrecord_staging_item' }),
                                text: result.getText({ name: 'custrecord_staging_item' })
                            };
                            let ndc = result.getValue({ name: 'custrecord_staging_ndc' }) || ' ';
                            let customer = result.getText({ name: 'custrecord_staging_customer' }) || ' ';
                            let date = result.getValue({ name: 'custrecord_staging_date' }) || ' ';
                            let price = Number(result.getValue({ name: 'custrecord_staging_price' })).toFixed(4) || 0;
                            let unit = result.getText({ name: 'custrecord_staging_unit' }) || ' ';
                            let qty = Number(result.getValue({ name: 'custrecord_staging_quantity' })).toFixed(4) || 0;
                            let amt = (qty * price).toFixed(4);
                            results.push({
                                id: id,
                                item: item,
                                ndc: ndc,
                                customer: customer,
                                date: date,
                                price: price,
                                unit: unit,
                                qty: qty,
                                amt: amt

                            });
                        })
                    }
                }
                return [results, searchResultCount];
            } catch (e) {
                log.error({ title: 'Error getStagingRecords:', details: e });
                return [[], 0]
            }
        }

  const resolveRecord = (id, type, params = {}) => {
    try {
      const objUrl = url.resolveRecord({recordId: id, recordType: type, isEditMode: false, params})
      return objUrl
    } catch (error) {
      log.error('Error on resolveRecord', error)
    }
  }
        return { onRequest }

    });
