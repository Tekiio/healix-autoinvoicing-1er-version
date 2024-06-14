/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
/**
* @name TKIO - Autoinvoicing from staging record - CS
* @version 1.0
* @author Ricardo López <ricardo.lopez@freebug.mx>
* @summary Descripción
* @copyright Tekiio México 2022
* 
* Client       -> Cliente
* Last modification  -> 19/06/203
* Modified by     -> Ricardo López <ricardo.lopez@freebug.mx>
* Script in NS    -> Registro en Netsuite <ID del registro>
*/
define(['N/url', "N/currentRecord", 'N/format', 'N/runtime', 'N/search', 'N/ui/message'],
    function (url, currentRecord, format, runtime, search, message) {


        const SCRIPT_SUITELET = {};
        SCRIPT_SUITELET.SCRIPTID = 'customscript_fb_autoinv_from_stgng_sl';
        SCRIPT_SUITELET.DEPLOYID = 'customdeploy_fb_autoinv_from_stgng_sl';

        const SCRIPT_TRACKING = {};
        SCRIPT_TRACKING.SCRIPTID = 'customscript_fb_autoinv_from_stgng_tk_sl';
        SCRIPT_TRACKING.DEPLOYID = 'customdeploy_fb_autoinv_from_stgng_tk_sl';
        let idStaging = []
        /**
         * Function to be executed after page is initialized.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.mode - The mode in which the record is being accessed (create, copy, or edit)
         *
         * @since 2015.2
         */
        function pageInit(scriptContext) {
            try {

                glbCurrentRecord = currentRecord.get();
                var objField = glbCurrentRecord.getValue({ fieldId: 'custpage_staging_ids' });
                let noResult = getParameterFromURL('not_results')
                let nofolio = getParameterFromURL('not_folio')
                console.log({ title: 'noResult', details: noResult });
                if (noResult === 'true') {
                    var mensajeExito = message.create({ type: message.Type.WARNING, title: "You have not selected staging.", message: 'You must select at least one line' });
                    mensajeExito.show({ duration: 5000 });
                }
                if (nofolio === 'true') {
                    var mensajeExito = message.create({ type: message.Type.WARNING, title: "You have not selected invoice.", message: 'You must select at invoice' });
                    mensajeExito.show({ duration: 5000 });
                }
                console.log({ title: 'objField', details: objField });
                idStaging = objField.split(',');
                idStaging = idStaging.filter(item => item !== '');
            } catch (e) {
                console.log({ title: 'pageInit', details: e });
            }

        }

        /**
         * Function to be executed when field is changed.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         * @param {string} scriptContext.fieldId - Field name
         * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field
         * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field
         *
         * @since 2015.2
         */
        function fieldChanged(scriptContext) {
            try {
                let currentForm = currentRecord.get();
                if (scriptContext.fieldId == 'custpage_pageid') {

                    var pageId = scriptContext.currentRecord.getValue({ fieldId: 'custpage_pageid' });

                    pageId = parseInt(pageId.split('_')[1]);
                    var stDate = scriptContext.currentRecord.getValue({ fieldId: 'custpage_sd' });
                    if (stDate != '' && stDate != null)
                        stDate = format.format({ value: stDate, type: format.Type.DATE });
                    var edDate = scriptContext.currentRecord.getValue({ fieldId: 'custpage_ed' });
                    if (edDate != '' && edDate != null)
                        edDate = format.format({ value: edDate, type: format.Type.DATE });
                    var customer = scriptContext.currentRecord.getValue({ fieldId: 'custpage_customer' });
                    var checkall = scriptContext.currentRecord.getValue({ fieldId: 'custpage_checkall' });
                    var uncheckall = scriptContext.currentRecord.getValue({ fieldId: 'custpage_uncheckall' });
                    var idsStaging = scriptContext.currentRecord.getValue({ fieldId: 'custpage_staging_ids' });

                    console.log({ title: 'idStaging', details: { checkall, uncheckall } });
                    var direccion = url.resolveScript({
                        scriptId: getParameterFromURL('script'),
                        deploymentId: getParameterFromURL('deploy'),
                        params: {
                            'page': pageId,
                            'stDate': stDate,
                            'edDate': edDate,
                            'customer_in': customer,
                            'idStaging': idsStaging,
                            'checkall': (checkall ? 'T' : 'F'),
                            'uncheckall': (uncheckall ? 'T' : 'F')

                        },
                        returnExternalUrl: false
                    });
                    window.open(direccion, '_self')
                }
                if (scriptContext.fieldId == 'custpage_employee') {

                    var employeeId = scriptContext.currentRecord.getValue({ fieldId: 'custpage_employee' });

                    var direccion = url.resolveScript({
                        scriptId: getParameterFromURL('script'),
                        deploymentId: getParameterFromURL('deploy'),
                        params: {
                            'employeeId': employeeId
                        },
                        returnExternalUrl: false
                    });
                    window.open(direccion, '_self')
                }
                if (scriptContext.fieldId === 'custpage_check') {
                    var idCheck = currentForm.getSublistValue({ sublistId: 'custpage_staging_list', fieldId: 'custpage_check', line: scriptContext.line });
                    let idItem = currentForm.getSublistValue({ sublistId: 'custpage_staging_list', fieldId: 'custpage_id', line: scriptContext.line });

                    var valorCA = glbCurrentRecord.getValue({ fieldId: 'custpage_checkall' });
                    var valorUA = glbCurrentRecord.getValue({ fieldId: 'custpage_uncheckall' });
                    if (!idCheck && valorCA) {
                        idStaging.push(idItem);
                    } else if (idCheck && valorUA) {
                        idStaging.push(idItem);
                    } else {
                        idStaging = idStaging.filter(item => item !== idItem);
                    }
                    console.log({ title: 'idStaging', details: idStaging.join(',') });
                    glbCurrentRecord.setValue({ fieldId: 'custpage_staging_ids', value: idStaging.join(',') });
                }
            } catch (e) {
                console.log({ title: 'Error fieldChange:', details: e });
            }
        }

        function get_Results() {
            try {
                console.log('get_Results');
                // Navigate to selected page
                var form = currentRecord.get();
                var stDate = form.getValue({ fieldId: 'custpage_sd' });
                if (stDate != '' && stDate != null)
                    stDate = format.format({ value: stDate, type: format.Type.DATE });
                // alert(stDate);
                var edDate = form.getValue({ fieldId: 'custpage_ed' });
                if (edDate != '' && edDate != null)
                    edDate = format.format({ value: edDate, type: format.Type.DATE });
                //alert(edDate);
                var customer_in = form.getValue({ fieldId: 'custpage_customer' });

                // TODO Colocar deployment original
                var su_url = url.resolveScript({
                    scriptId: SCRIPT_SUITELET.SCRIPTID,
                    deploymentId: SCRIPT_SUITELET.DEPLOYID,
                    params: {
                        'stDate': stDate,
                        'edDate': edDate,
                        'customer_in': customer_in,
                    }
                });
                document.location = su_url;
            } catch (e) {
                console.log({ title: 'Error get_Results:', details: e });
            }
        }
        function getParameterFromURL(param) {
            try {
                var query = window.location.search.substring(1);
                var vars = query.split("&");
                for (var i = 0; i < vars.length; i++) {
                    var pair = vars[i].split("=");
                    if (pair[0] == param) {
                        return decodeURIComponent(pair[1]);
                    }
                }
                return (false);
            } catch (e) {
                console.log({ title: 'Error getParameterFromURL', details: e });
            }
        }
        function checkAll() {
            try {
                glbCurrentRecord = currentRecord.get();
                var lineCount = glbCurrentRecord.getLineCount({
                    sublistId: 'custpage_staging_list'
                });
                console.log({ title: 'lineCount', details: lineCount });
                for (var index = 0; index < lineCount; index++) {
                    setSublistValue('custpage_staging_list', 'custpage_check', index, true);
                }
                var valor = glbCurrentRecord.getValue({ fieldId: 'custpage_checkall' });
                glbCurrentRecord.setValue({ fieldId: 'custpage_checkall', value: !valor });
                glbCurrentRecord.setValue({ fieldId: 'custpage_uncheckall', value: false });
                glbCurrentRecord.setValue({ fieldId: 'custpage_staging_ids', value: '' });
                //Validacion para cuando se pulse dos veces
                var valorCA = glbCurrentRecord.getValue({ fieldId: 'custpage_checkall' });
                var valorUA = glbCurrentRecord.getValue({ fieldId: 'custpage_uncheckall' });
                if (!valorCA && !valorUA) {
                    glbCurrentRecord.setValue({ fieldId: 'custpage_checkall', value: true });
                }
                idStaging = []
            } catch (e) {
                console.log({ title: 'Error checkAll:', details: e });
            }
        }
        function uncheckAll() {
            try {
                glbCurrentRecord = currentRecord.get();
                var lineCount = glbCurrentRecord.getLineCount({
                    sublistId: 'custpage_staging_list'
                });
                console.log({ title: 'lineCount', details: lineCount });
                for (var index = 0; index < lineCount; index++) {
                    setSublistValue('custpage_staging_list', 'custpage_check', index, false);
                }
                var valor = glbCurrentRecord.getValue({ fieldId: 'custpage_uncheckall' });
                glbCurrentRecord.setValue({ fieldId: 'custpage_uncheckall', value: !valor });
                glbCurrentRecord.setValue({ fieldId: 'custpage_checkall', value: false });
                glbCurrentRecord.setValue({ fieldId: 'custpage_staging_ids', value: '' });
                //Validacion para cuando se pulse dos veces
                var valorCA = glbCurrentRecord.getValue({ fieldId: 'custpage_checkall' });
                var valorUA = glbCurrentRecord.getValue({ fieldId: 'custpage_uncheckall' });
                if (!valorCA && !valorUA) {
                    glbCurrentRecord.setValue({ fieldId: 'custpage_uncheckall', value: true });
                }
                idStaging = []
            } catch (e) {
                console.log({ title: 'Error uncheckAll:', details: e });
            }
        }
        function setSublistValue(sublistId, fieldId, line, value) {
            glbCurrentRecord.selectLine({ sublistId: sublistId, line: line });
            glbCurrentRecord.setCurrentSublistValue({ sublistId: sublistId, fieldId: fieldId, value: value, line: line });
        }
        function returnToResults() {
            try {
                var su_url = url.resolveScript({
                    scriptId: SCRIPT_SUITELET.SCRIPTID,
                    deploymentId: SCRIPT_SUITELET.DEPLOYID
                });
                document.location = su_url;
            } catch (e) {
                console.log({ title: 'Error returnToResults', details: e });
            }
        }
        function reload() {
            try {
                
                let trackingRecordId = getParameterFromURL('trackingRecordId')
                let statusPage= getParameterFromURL('statusPage')
                let mapReduceTask = getParameterFromURL('mapReduceTask')
                var su_url = url.resolveScript({
                    scriptId: SCRIPT_TRACKING.SCRIPTID,
                    deploymentId: SCRIPT_TRACKING.DEPLOYID,
                    params: {
                        'mapReduceTask': mapReduceTask,
                        'statusPage': statusPage,
                        'trackingRecordId': trackingRecordId,

                    },
                });
                document.location = su_url;
            } catch (e) {
                console.log({ title: 'Error returnToResults', details: e });
            }
        }
        function returnToTracking() {
            try {
                var su_url = url.resolveScript({
                    scriptId: SCRIPT_TRACKING.SCRIPTID,
                    deploymentId: SCRIPT_TRACKING.DEPLOYID
                });
                document.location = su_url;
            } catch (e) {
                console.log({ title: 'Error returnToResults', details: e });
            }
        }
        /**
         * Function to be executed when field is slaved.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         * @param {string} scriptContext.fieldId - Field name
         *
         * @since 2015.2
         */
        function postSourcing(scriptContext) {

        }

        /**
         * Function to be executed after sublist is inserted, removed, or edited.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @since 2015.2
         */
        function sublistChanged(scriptContext) {

        }

        /**
         * Function to be executed after line is selected.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @since 2015.2
         */
        function lineInit(scriptContext) {

        }

        /**
         * Validation function to be executed when field is changed.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         * @param {string} scriptContext.fieldId - Field name
         * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field
         * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field
         *
         * @returns {boolean} Return true if field is valid
         *
         * @since 2015.2
         */
        function validateField(scriptContext) {

        }

        /**
         * Validation function to be executed when sublist line is committed.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @returns {boolean} Return true if sublist line is valid
         *
         * @since 2015.2
         */
        function validateLine(scriptContext) {

        }

        /**
         * Validation function to be executed when sublist line is inserted.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @returns {boolean} Return true if sublist line is valid
         *
         * @since 2015.2
         */
        function validateInsert(scriptContext) {

        }

        /**
         * Validation function to be executed when record is deleted.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @param {string} scriptContext.sublistId - Sublist name
         *
         * @returns {boolean} Return true if sublist line is valid
         *
         * @since 2015.2
         */
        function validateDelete(scriptContext) {

        }

        /**
         * Validation function to be executed when record is saved.
         *
         * @param {Object} scriptContext
         * @param {Record} scriptContext.currentRecord - Current form record
         * @returns {boolean} Return true if record is valid
         *
         * @since 2015.2
         */
        function saveRecord(scriptContext) {

        }

        return {
            pageInit: pageInit,
            fieldChanged: fieldChanged,
            get_Results: get_Results,
            checkAll: checkAll,
            uncheckAll: uncheckAll,
            returnToResults: returnToResults,
            returnToTracking: returnToTracking,
            reload: reload
            // postSourcing: postSourcing,
            // sublistChanged: sublistChanged,
            // lineInit: lineInit,
            // validateField: validateField,
            // validateLine: validateLine,
            // validateInsert: validateInsert,
            // validateDelete: validateDelete,
            // saveRecord: saveRecord
        };

    });
