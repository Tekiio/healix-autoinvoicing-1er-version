/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
/**
* @name TKIO - Autoinvoicing from staging record tracking - SL
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
    'N/redirect', 'N/encode', 'N/https', 'N/format', 'N/task', 'N/url'], (serverWidget, search, http, file, record, runtime, xml, render, redirect, encode, https, format, task, url) => {

        var PAGE_SIZE = 1000;

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
                        // if exist status (process in MapReduce)
                        if (scriptContext.request.parameters.hasOwnProperty('statusPage') && scriptContext.request.parameters.statusPage) {
                            // Generates status panel to generate invoices
                            createPanelForStatus(scriptContext, serverWidget);
                        } else {
                            // List the tracking for staging values ( )
                            createPanel(scriptContext, serverWidget, search);
                        }
                        break;
                    case 'POST':

                        // get parameters for verified the status process
                        var folio = scriptContext.request.parameters.custpage_folio;
                        log.audit({ title: 'folio', details: folio });
                        if (folio !== '0') {

                            let trackingRecord = record.load({ type: TRACKING_RECORD.ID, id: folio, isDynamic: true });
                            let taskID = trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_task_id_mr' });
                            log.audit({ title: 'folio', details: folio });
                            // Redirects on itself to see the status of the process, as well as the results of the execution
                            redirect.toSuitelet({
                                scriptId: SCRIPT_TRACKING.SCRIPTID,
                                deploymentId: SCRIPT_TRACKING.DEPLOYID,
                                parameters: {
                                    'statusPage': true,
                                    'mapReduceTask': taskID,
                                    'trackingRecordId': folio
                                }
                            });
                        } else {
                            redirect.toSuitelet({
                                scriptId: scriptContext.request.parameters.script,
                                deploymentId: scriptContext.request.parameters.deploy,
                                parameters: {
                                    'not_folio': true
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

                var form = serverWidget.createForm({ title: 'Auto-Invoicing Logs', hideNavBar: false });
                // Get parameters
                var folio = context.request.parameters.folio;
                var employeeId = context.request.parameters.employeeId || '';
                var pageId = parseInt(context.request.parameters.page) || 0;
                form.clientScriptModulePath = './TKIO - Autoinvoicing from staging record - CS';
                log.audit({ title: 'employeeId', details: employeeId });
                form.addSubmitButton({ id: 'custpage_filter', label: 'Filter' });
                form.addButton({ id: 'custpage_return', label: 'Go to Autoinvoicing', functionName: 'returnToResults();' });

                log.audit({ title: 'folio', details: folio });
                //Add filters to search
                var folio = form.addField({ id: 'custpage_folio', label: 'Invoice', type: 'select', source: 'custrecord_tkio_staging_lines_processed' }).updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
                var employee = form.addField({ id: 'custpage_employee', label: 'Employee', type: 'select', source: record.Type.EMPLOYEE }).updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
                var selectOptions = form.addField({ id: 'custpage_pageid', label: 'Page', type: serverWidget.FieldType.SELECT }).updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

                if (employeeId !== '') {
                    employee.defaultValue = employeeId
                }
                // Create the sublist for add the values
                var sublist = form.addSublist({ id: 'custpage_staging_list', type: serverWidget.SublistType.LIST, label: 'Stagings' });

                // Add columns to be shown on Page
                sublist.addField({ id: 'custpage_task_successfully', label: ' ', type: serverWidget.FieldType.CHECKBOX }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
                sublist.addField({ id: 'custpage_employee', label: 'Employee', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_date', label: 'Date', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_number_processed', label: 'Processed', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_number_not_processed', label: 'Not Processed', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_task_id', label: 'Task ID', type: serverWidget.FieldType.TEXT });

                let resultsStaging = getStagingTrackingRecords(PAGE_SIZE, employeeId);
                let resultsFolio = getFolio(PAGE_SIZE);
                log.audit({ title: 'Results: ', details: resultsStaging });
                log.audit({ title: 'Results folio: ', details: resultsFolio });
                if (resultsStaging.length > 0) {
                    // Set data returned to columns
                    var j = 0;
                    // Add the values in the table
                    resultsStaging.forEach(function (result) {

                        // Valid if the id is in the pagination list
                        sublist.setSublistValue({ id: 'custpage_task_successfully', line: j, value: (result.processSuccesfully ? 'T' : 'F') });
                        sublist.setSublistValue({ id: 'custpage_employee', line: j, value: result.employee.text||' ' });
                        sublist.setSublistValue({ id: 'custpage_date', line: j, value: result.date||' ' });
                        sublist.setSublistValue({ id: 'custpage_number_processed', line: j, value: result.linesProcessed||' ' });
                        sublist.setSublistValue({ id: 'custpage_number_not_processed', line: j, value: result.linesNotProcessed||' ' });
                        sublist.setSublistValue({ id: 'custpage_task_id', line: j, value: result.taskid||' ' });
                        j++
                    });

                    let pageCount = Math.ceil(resultsStaging.length / PAGE_SIZE);
                    log.audit({ title: 'Paginacion', details: { NoPags: PAGE_SIZE, noResult: resultsStaging.length, pageCount: pageCount } });
                    for (var i = 0; i < pageCount; i++) {
                        if (i == pageId) {
                            selectOptions.addSelectOption({ value: 'pageid_' + i, text: ('Page ' + ((i * PAGE_SIZE) + 1) + ' - ' + ((i + 1) * PAGE_SIZE)), isSelected: true });
                        } else {
                            selectOptions.addSelectOption({ value: 'pageid_' + i, text: ('Page ' + ((i * PAGE_SIZE) + 1) + ' - ' + ((i + 1) * PAGE_SIZE)) });
                        }
                    }
                }
                if (resultsFolio.length > 0) {
                    folio.addSelectOption({
                        value: 0,
                        text: ' '
                    });
                    for (var i = 0; i < resultsFolio.length; i++) {
                        folio.addSelectOption(resultsFolio[i]);
                    }
                }
                context.response.writePage(form);
            } catch (e) {
                log.error({ title: 'Error createPanel:', details: e });
            }
        }
        function getStagingTrackingRecords(searchPageSize, employeeId) {
            try {
                var filters = [];
                var customrecord_tkio_staging_trancking_rcdSearchObj = search.create({
                    type: "customrecord_tkio_staging_trancking_rcd",
                    columns:
                        [
                            search.createColumn({ name: "custrecord_tkio_staging_task_id_mr", label: "Task id MapReduce" }),
                            search.createColumn({ name: "custrecord_tkio_staging_employee", label: "Employee" }),
                            search.createColumn({ name: "custrecord_tkio_staging_lines_processed", label: "Lines processed" }),
                            search.createColumn({ name: "custrecord_tkio_staging_errors", label: "Lines not processed" }),
                            search.createColumn({ name: "custrecord_tkio_staging_processed_succes", label: "Processed successfully" }),
                            search.createColumn({ name: "created", label: "Date Created" })
                        ]
                });
                if (employeeId !== '') {
                    var employeeFilter = search.createFilter({ name: 'custrecord_tkio_staging_employee', operator: 'anyof', values: employeeId });
                    customrecord_tkio_staging_trancking_rcdSearchObj.filters.push(employeeFilter);
                }
                // searchObj.filterExpression = filters;

                var searchResultCount = customrecord_tkio_staging_trancking_rcdSearchObj.runPaged().count;
                var dataResults = customrecord_tkio_staging_trancking_rcdSearchObj.runPaged({ pageSize: searchPageSize });

                log.audit({ title: 'Filtros', details: customrecord_tkio_staging_trancking_rcdSearchObj.filters });
                var results = new Array();

                //Obtain the data for send at MapReduce
                var thePageRanges = dataResults.pageRanges;
                for (var i in thePageRanges) {
                    var searchPage = dataResults.fetch({ index: thePageRanges[i].index });
                    searchPage.data.forEach(function (result) {
                        let taskid = result.getValue({ name: 'custrecord_tkio_staging_task_id_mr' }) || ' ';
                        let employee = {
                            value: result.getValue({ name: 'custrecord_tkio_staging_employee' }),
                            text: result.getText({ name: 'custrecord_tkio_staging_employee' })
                        };
                        let linesProcessed = result.getValue({ name: 'custrecord_tkio_staging_lines_processed' }) || '';
                        linesProcessed = linesProcessed.split(',')
                        linesProcessed = linesProcessed.filter(track => track !== '')
                        linesProcessed = linesProcessed.length
                        let linesNotProcessed = (result.getValue({ name: 'custrecord_tkio_staging_errors' })) || '';
                        linesNotProcessed = linesNotProcessed.split(',')
                        linesNotProcessed = linesNotProcessed.filter(track => track !== '')
                        linesNotProcessed = linesNotProcessed.length
                        let processSuccesfully = result.getValue({ name: 'custrecord_tkio_staging_processed_succes' }) || ' ';
                        log.audit({ title: 'Arreglos', details: { linesProcessed, linesNotProcessed } });
                        let date = result.getValue({ name: 'created' }) || ' ';
                        results.push({
                            taskid,
                            employee,
                            linesProcessed,
                            linesNotProcessed,
                            processSuccesfully,
                            date
                        });
                    })

                }
                return results;
            } catch (e) {
                log.error({ title: 'Error getStagingRecords:', details: e });
                return [[], 0]
            }
        }
        //Get folio by list
        function getFolio(searchPageSize) {
            try {
                let arrFolio = [];
                var customrecord_tkio_staging_trancking_rcdSearchObj = search.create({
                    type: "customrecord_tkio_staging_trancking_rcd",
                    columns:
                        [
                            search.createColumn({ name: "internalid", label: "Internal ID" }),
                            search.createColumn({ name: "name", sort: search.Sort.ASC, label: "Name" })
                        ]
                });
                var searchResultCount = customrecord_tkio_staging_trancking_rcdSearchObj.runPaged().count;
                var dataResults = customrecord_tkio_staging_trancking_rcdSearchObj.runPaged({ pageSize: searchPageSize });
                log.debug("customrecord_tkio_staging_trancking_rcdSearchObj result count", searchResultCount);

                var thePageRanges = dataResults.pageRanges;
                for (var i in thePageRanges) {
                    var searchPage = dataResults.fetch({ index: thePageRanges[i].index });
                    searchPage.data.forEach(function (result) {
                        log.audit({ title: 'result', details: result });
                        arrFolio.push({
                            value: result.getValue({ name: 'internalid' }),
                            text: result.getValue({ name: 'name' })
                        })
                    })
                }
                return arrFolio
            } catch (e) {
                log.error({ title: 'Error getFolio:', details: e });
            }
        }
        //Create the panel by status process
        function createPanelForStatus(scriptContext, serverWidget) {
            try {
                // Get parameter values
                var taskID = scriptContext.request.parameters.mapReduceTask;
                var trackingRecordId = scriptContext.request.parameters.trackingRecordId;
                // Init form
                let trackingRecord = record.load({ type: TRACKING_RECORD.ID, id: trackingRecordId, isDynamic: true });
                let trackingRecordName = trackingRecord.getValue({ fieldId: 'name' })
                var form = serverWidget.createForm({ title: ('Autoinvoicing status ' + trackingRecordName), hideNavBar: false });
                // Load events to ClientScript
                form.clientScriptModulePath = './TKIO - Autoinvoicing from staging record - CS';


                log.audit({ title: 'trackingRecordId', details: trackingRecordId });

                // Load tracking record to validate the lines processed successfully and lines with error

                // Get the lines processed and lines not processed, to get details, items, stagings records and transacion related
                let arrStagingProcessed = [];
                arrStagingProcessed = trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_lines_processed' });
                let arrStagingNotProcessed = [];
                arrStagingNotProcessed = trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_errors' });

                // Filter the elements null or empty
                let ids = arrStagingProcessed.concat(arrStagingNotProcessed);
                ids = ids.filter(track => track !== '')

                // If ids is minor that 0, dont execute the saved search
                let dataTracking = (ids.length > 0 ? getTrackingRecords(ids) : [[], []]);
                log.audit({ title: 'data-Tracking', details: dataTracking });

                // Get the lines processed
                let linesProcessedSuccesfully = dataTracking[0];
                // Get the lines not processed
                let errors = dataTracking[1];

                let processed = trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_processed_succes' });

                log.audit({title: 'taskID', details: taskID});
                var mrStatus = task.checkStatus({ taskId: taskID });
                log.audit({ title: 'Validation for status:', details: { trackingRecord, errors, linesProcessedSuccesfully, processed, mrStatus } });


                // Create dinamic mensagge 
                let msgTxt = (ids.length > 0 ? '' : 'Autoinvoicing in process please wait a moment and reload the page...');
                var statusMsgField = form.addField({ id: 'custpage_status_message', label: ' ', type: serverWidget.FieldType.TEXTAREA });
                statusMsgField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

                // If the process mapReduce finished completely or some problem occurred, it generates the buttons to return from autoinvoicing or status of the processes
                if (task.TaskStatus.FAILED === mrStatus.status || task.TaskStatus.COMPLETE === mrStatus.status) {
                    form.addButton({ id: 'custpage_return', label: 'Go to Autoinvoicing', functionName: 'returnToResults();' });
                    form.addButton({ id: 'custpage_return_tracking', label: 'Go to Tracking Record', functionName: 'returnToTracking();' });
                } else {
                    form.addButton({ id: 'custpage_reload', label: 'Reload', functionName: 'reload();' });
                }

                // If it finished without problems, it shows a table with the details of the lines processed and those that were not
                var sublist1 = form.addSublist({ id: 'custpage_correct_list', type: serverWidget.SublistType.LIST, label: 'Invoices processed' });
                // Add columns to be shown on Page (LINES PROCESSED)
                sublist1.addField({ id: 'custpage_staging', label: 'Staging', type: serverWidget.FieldType.TEXT });
                sublist1.addField({ id: 'custpage_item', label: 'Item', type: serverWidget.FieldType.TEXT });
                sublist1.addField({ id: 'custpage_invoice', label: 'invoice', type: serverWidget.FieldType.TEXT });

                if (linesProcessedSuccesfully.length > 0) {
                    for (var i = 0; i < linesProcessedSuccesfully.length; i++) {
                        // Add values on table (LINES PROCESSED)
                        var stagingLink = url.resolveRecord({ recordType: 'customrecord_staging', recordId: linesProcessedSuccesfully[i].staging.id, isEditMode: false });
                        sublist1.setSublistValue({ id: 'custpage_staging', line: i, value: "<a href=" + stagingLink + ">" + linesProcessedSuccesfully[i].staging.text + "</a>" });
                        sublist1.setSublistValue({ id: 'custpage_item', line: i, value: linesProcessedSuccesfully[i].item.text });
                        var invoiceLink = url.resolveRecord({ recordType: record.Type.INVOICE, recordId: linesProcessedSuccesfully[i].transaction.id, isEditMode: false });
                        sublist1.setSublistValue({ id: 'custpage_invoice', line: i, value: "<a href=" + invoiceLink + ">" + linesProcessedSuccesfully[i].transaction.text + "</a>" });
                    }
                    msgTxt += '\nAutoinvoicing completed \n\n Number of Stagings processed correctly ' + linesProcessedSuccesfully.length + '. \n'
                }

                var sublist = form.addSublist({ id: 'custpage_details_list', type: serverWidget.SublistType.LIST, label: 'Details table' });
                // Add columns to be shown on Page (LINES NOT PROCESSED)
                sublist.addField({ id: 'custpage_staging', label: 'Staging', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_item', label: 'Item', type: serverWidget.FieldType.TEXT });
                sublist.addField({ id: 'custpage_detail', label: 'Detail', type: serverWidget.FieldType.TEXTAREA });

                if (errors.length > 0) {
                    for (var i = 0; i < errors.length; i++) {
                        // Add values on table (LINES NOT PROCESSED)
                        var stagingLink = url.resolveRecord({ recordType: 'customrecord_staging', recordId: errors[i].staging.id, isEditMode: false });
                        sublist.setSublistValue({ id: 'custpage_staging', line: i, value: "<a href=" + stagingLink + ">" + errors[i].staging.text + "</a>" });
                        sublist.setSublistValue({ id: 'custpage_item', line: i, value: errors[i].item.text });
                        sublist.setSublistValue({ id: 'custpage_detail', line: i, value: errors[i].detail });
                    }
                    msgTxt += '\nNumber of Stagings not processed because they have a detail ' + errors.length + '. \n'
                }

                statusMsgField.defaultValue = msgTxt;
                // Analized if ocurrs some problem during the execution
                if (task.TaskStatus.FAILED === mrStatus.status) {
                    statusMsgField.defaultValue = 'A problem occurred during execution, please contact your administrator.';

                }

                scriptContext.response.writePage(form);
            } catch (e) {
                log.error({ title: 'Error createPanelForStatus:', details: e });
            }
        }
        // Function that return the values (Lines processed and lines not processed)
        function getTrackingRecords(ids) {
            try {
                let arrProcessed = [];
                let arrNotProcessed = [];
                var searchResult = search.create({
                    type: "customrecord_tkio_lines_process_sr_tk",
                    filters:
                        [
                            ["internalid", "anyof", ids]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "name", sort: search.Sort.ASC, label: "Name" }),
                            search.createColumn({ name: "custrecord_tkio_staging_id_process", label: "Staging" }),
                            search.createColumn({ name: "custrecord_tkio_staging_trand_generated", label: "Transaction" }),
                            search.createColumn({ name: "custrecord_tkio_staging_item_used", label: "Item" }),
                            search.createColumn({ name: "displayname", join: "CUSTRECORD_TKIO_STAGING_ITEM_USED", label: "Display Name" }),
                            search.createColumn({ name: "custrecord_tkio_staging_detail_process", label: "Detail" }),
                        ]
                });

                var searchResultCount = searchResult.runPaged().count;
                log.audit({ title: 'searchResultCount', details: searchResultCount });
                // Loop to results the saved search for get the lines processed and lines not processed
                searchResult.run().each(function (result) {
                    var obj = {
                        item: {
                            id: result.getValue({ name: "custrecord_tkio_staging_item_used" }) || '',
                            text: (result.getText({ name: 'custrecord_tkio_staging_item_used' }) || '') + ' ' + (result.getValue({ name: "displayname", join: "CUSTRECORD_TKIO_STAGING_ITEM_USED" }) || ''),
                        },
                        staging: {
                            id: result.getValue({ name: "custrecord_tkio_staging_id_process" }) || '',
                            text: result.getText({ name: "custrecord_tkio_staging_id_process" }) || '',
                        },
                        detail: result.getValue({ name: "custrecord_tkio_staging_detail_process" }) || '',
                        transaction:
                        {
                            id: result.getValue({ name: "custrecord_tkio_staging_trand_generated" }) || '',
                            text: result.getText({ name: "custrecord_tkio_staging_trand_generated" }) || ''
                        }
                    }
                    if (obj.detail !== '' && obj.transaction.id === '') {
                        arrNotProcessed.push(obj)
                    } else if (obj.detail === '' && obj.transaction.id === '') {
                        obj.detail = 'Unidentified detail, rerun and if detail persists, notify administrator.'
                        arrNotProcessed.push(obj)
                    } else if (obj.transaction.text !== '') {
                        arrProcessed.push(obj)
                    }
                    return true;
                });
                return [arrProcessed, arrNotProcessed]
            } catch (e) {
                log.error({ title: 'Error getTrackingRecords:', details: e });
                return [[], []]
            }
        }
        return { onRequest }

    });
