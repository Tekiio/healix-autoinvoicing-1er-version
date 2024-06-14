/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
/**
 * @name TKIO - Autoinvoicing from staging record - MR
 * @version 1.0
 * @author Ricardo López <ricardo.lopez@freebug.mx>
 * @summary Descripción
 * @copyright Tekiio México 2022
 *
 * MapReduce       -> MapReduce
 * Last modification  -> 20/06/2023
 * Modified by     -> Ricardo López <ricardo.lopez@freebug.mx>
 * Script in NS    -> Registro en Netsuite <ID del registro>
 */
define(['N/log', 'N/search', 'N/runtime', 'N/record'], (log, search, runtime, record) => {
  /**
   * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
   * @param {Object} inputContext
   * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {Object} inputContext.ObjectRef - Object that references the input data
   * @typedef {Object} ObjectRef
   * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
   * @property {string} ObjectRef.type - Type of the record instance that contains the input data
   * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
   * @since 2015.2
   */

  const TRACKING_RECORD = {}
  TRACKING_RECORD.ID = 'customrecord_tkio_staging_trancking_rcd'

  const PARAMETERS_SCRIPT = {}
  PARAMETERS_SCRIPT.ID_TRACKING_RECORD = 'custscript_tkio_tracking_record'
  PARAMETERS_SCRIPT.IDS_STAGING_TO_PROCESS = 'custscript_tkio_ids_staging_mr'

  const ERRORS_DETAIL = {
    NOTLOT: 'The staging does not have the LOT field',
    NOTSERIALLOT: 'For the item there is no SERIAL/LOT NUMBER with the LOT established in the staging',
    NOTMATCHUNIT: 'The lot does not have the same units as the item',
    NOTUNIT: 'The staging does not have the units',
    LOWPRICE: 'The staging price must be greater than 0',
    LOWQTY: 'The staging quantity must be greater than 0',
    INSQTY: 'The lot does not have enough quantity for this transaction',
    NOTMATCHSUB: 'Customer and location do not correspond to the same subsidiary',
    NOTMATCHSUB_ITEM: 'Customer and Item do not correspond to the same subsidiary'
  }

  const getInputData = inputContext => {
    try {
      let scriptObj = runtime.getCurrentScript()
      let idsStaging = scriptObj.getParameter({ name: PARAMETERS_SCRIPT.IDS_STAGING_TO_PROCESS })
      let trackingRecordId = scriptObj.getParameter({ name: PARAMETERS_SCRIPT.ID_TRACKING_RECORD })
      idsStaging = JSON.parse(idsStaging)
      let trackingRecord = record.load({ type: TRACKING_RECORD.ID, id: trackingRecordId, isDynamic: true })
      trackingRecord.setValue({ fieldId: 'custrecord_tkio_staging_errors', value: [] })
      trackingRecord.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      })
      log.audit({ title: 'Parameters:', details: { idsStaging, trackingRecordId } })

      let data = getStagingRecords(idsStaging)
      let results = data.resultGroup
      let errors = data.errorsFind

      results = results.concat(errors)
      log.audit({ title: 'Results:', details: results })

      return results
    } catch (e) {
      log.error({ title: 'Error getInputData:', details: e })
    }
  }
  function getStagingRecords(idsStaging) {
    try {
      var filters = [['internalid', search.Operator.ANYOF, idsStaging]]
      var searchObj = search.create({
        type: 'customrecord_staging',
        filters: filters,
        columns: [
          search.createColumn({ name: 'internalid', label: 'Internal ID' }),
          search.createColumn({ name: 'custrecord_staging_item', label: 'Item' }),
          search.createColumn({ name: 'type', join: 'CUSTRECORD_STAGING_ITEM', label: 'Type' }),
          search.createColumn({ name: 'custrecord_staging_ndc', label: 'NDC' }),
          search.createColumn({ name: 'custrecord_staging_customer', label: 'Customer' }),
          search.createColumn({ name: 'subsidiarynohierarchy', join: 'CUSTRECORD_STAGING_CUSTOMER', label: 'Primary Subsidiary (no hierarchy)' }),
          search.createColumn({ name: 'custrecord_staging_date', label: 'Date ' }),
          search.createColumn({ name: 'custrecord_staging_price', label: 'Price' }),
          search.createColumn({ name: 'custrecord_staging_unit', label: 'Unit' }),
          search.createColumn({ name: 'custrecord_staging_quantity', label: 'Quantity' }),
          search.createColumn({ name: 'custrecord_staging_location', label: 'Location' }),
          search.createColumn({ name: 'subsidiary', join: 'CUSTRECORD_STAGING_LOCATION', label: 'Subsidiary' }),
          search.createColumn({ name: 'custrecord_staging_lot', label: 'Lot' }),
          search.createColumn({ name: 'subsidiary', join: 'CUSTRECORD_STAGING_ITEM', label: 'Subsidiary' }),
          search.createColumn({ name: 'includechildren', join: 'CUSTRECORD_STAGING_ITEM', label: 'Include Children' })
        ]
      })
      var dataResults = searchObj.runPaged({ pageSize: 1000 })
      var results = new Array()
      var arrLot = new Array()
      // Obtain th data for saved search
      var thePageRanges = dataResults.pageRanges
      for (var i in thePageRanges) {
        var searchPage = dataResults.fetch({ index: thePageRanges[i].index })
        searchPage.data.forEach(function (result) {
          let id = result.getValue({ name: 'internalid' }) || ' '
          let item = {
            id: result.getValue({ name: 'custrecord_staging_item' }),
            name: result.getText({ name: 'custrecord_staging_item' }),
            lot: result.getValue({ name: 'custrecord_staging_lot' }) || '',
            lotId: '',
            lotUnit: '',
            lotQty: '',
            type: result.getValue({ name: 'type', join: 'CUSTRECORD_STAGING_ITEM' }) || 'Not identified',
            sub: result.getText({ name: 'subsidiary', join: 'CUSTRECORD_STAGING_ITEM' }) || ' ',
            subId: result.getValue({ name: 'subsidiary', join: 'CUSTRECORD_STAGING_ITEM' }) || ' ',
            subChild: result.getValue({ name: 'includechildren', join: 'CUSTRECORD_STAGING_ITEM' }) || false
          }
          let ndc = result.getValue({ name: 'custrecord_staging_ndc' }) || ' '
          let customer = {
            value: result.getValue({ name: 'custrecord_staging_customer' }),
            text: result.getText({ name: 'custrecord_staging_customer' }),
            sub: result.getText({ name: 'subsidiarynohierarchy', join: 'CUSTRECORD_STAGING_CUSTOMER' }),
            subId: result.getValue({ name: 'subsidiarynohierarchy', join: 'CUSTRECORD_STAGING_CUSTOMER' })
          }
          let location = {
            value: result.getValue({ name: 'custrecord_staging_location' }),
            text: result.getText({ name: 'custrecord_staging_location' }),
            sub: result.getValue({ name: 'subsidiary', join: 'CUSTRECORD_STAGING_LOCATION' })
          }
          let date = result.getValue({ name: 'custrecord_staging_date' }) || ' '
          let price = Number(result.getValue({ name: 'custrecord_staging_price' })).toFixed(2) || 0
          let unit = {
            value: result.getValue({ name: 'custrecord_staging_unit' }) || '',
            text: result.getText({ name: 'custrecord_staging_unit' }) || ''
          }
          let qty = Number(result.getValue({ name: 'custrecord_staging_quantity' })).toFixed(2) || 0
          let amt = (qty * price).toFixed(2)
          arrLot.push(item.lot)
          if (item.subId === customer.subId) {
            results.push({
              id: id,
              item: item,
              ndc: ndc,
              customer: customer,
              location: location,
              date: date,
              price: price,
              unit: unit,
              qty: qty * 1,
              amt: amt * 1
            })
          }
        })
      }
      log.audit({ title: 'Results count: ', details: results.length })
      log.audit({ title: 'Results: ', details: results })
      results = getIdLotNumber(results)

      // Validations and error control
      let validation = validationErrors(results)
      results = validation.results
      let errorsFind = validation.arrayErrors

      let resultGroup = []
      let arrGroupByCustomer = results.reduce((resultado, staging) => {
        if (!resultado[staging.customer.value]) {
          resultado[staging.customer.value] = []
        }
        resultado[staging.customer.value].push(staging)
        return resultado
      }, {})
      // log.audit({ title: 'arrGroupByCustomer', details: true });
      for (customerId in arrGroupByCustomer) {
        let arrGroupByLocation = arrGroupByCustomer[customerId].reduce((resultado, staging) => {
          if (!resultado[staging.location.value]) {
            resultado[staging.location.value] = []
          }
          resultado[staging.location.value].push(staging)
          return resultado
        }, {})

        log.audit('getStagingRecords | arrGroupByLocation:', arrGroupByLocation)
        var idstagings = []
        for (let i in arrGroupByLocation) {
          let item = arrGroupByLocation[i]
          var objAux = {}
          for (let j in item) {
            if (!objAux[item[j].item.id]) {
                item[j].qty = Number(item[j].qty)
                item[j].amt = Number(item[j].amt)
              objAux[item[j].item.id] = item[j]
            } else {
              objAux[item[j].item.id].qty += Number(item[j].qty)
              objAux[item[j].item.id].amt += Number(item[j].amt)
            }
            idstagings.push(item[j])
          }

          arrGroupByLocation[i] = Object.values(objAux).map(item => item)
        }
        log.audit('getStagingRecords | arrGroupByLocation:', arrGroupByLocation)

        // log.audit({ title: 'arrGroupByLocation', details: true });
        for (locationId in arrGroupByLocation) {
          resultGroup.push({
            customer: customerId,
            location: arrGroupByLocation[locationId][0].location,
            arrStaging: arrGroupByLocation[locationId],
            idstagings: idstagings
          })
        }
      }

      // log.audit({ title: 'arrGroupByCustomer', details: {resultGroup, errorsFind} });
      return { resultGroup, errorsFind }
    } catch (e) {
      log.error({ title: 'Error getStagingRecords:', details: e })
      return []
    }
  }
  function getIdLotNumber(arrStaging) {
    try {
      var inventorydetailSearchObj = search.create({
        type: 'inventorydetail',
        filters: [],
        columns: [
          search.createColumn({ name: 'internalid', label: 'Internal ID' }),
          search.createColumn({ name: 'inventorynumber', sort: search.Sort.ASC, label: ' Number' }),
          search.createColumn({ name: 'binnumber', label: 'Bin Number' }),
          search.createColumn({ name: 'quantity', label: 'Quantity' }),
          search.createColumn({ name: 'itemcount', label: 'Item Count' }),
          search.createColumn({ name: 'expirationdate', label: 'Expiration Date' }),
          search.createColumn({ name: 'unit', join: 'transaction', label: 'Units' })
        ]
      })
      var searchResultCount = inventorydetailSearchObj.runPaged().count
      var dataResults = inventorydetailSearchObj.runPaged({ pageSize: 1000 })

      var results = new Array()
      // Obtain th data for saved search
      var thePageRanges = dataResults.pageRanges
      for (var i in thePageRanges) {
        var searchPage = dataResults.fetch({ index: thePageRanges[i].index })
        searchPage.data.forEach(function (result) {
          let lotName = result.getText({ name: 'inventorynumber' })
          let lotId = result.getValue({ name: 'inventorynumber' })
          arrStaging.map(stagingPib => {
            if (stagingPib.item.lot === lotName) {
              stagingPib.item.lotId = lotId
              stagingPib.item.lotUnit = {
                value: result.getValue({ name: 'unit', join: 'transaction' })
              }
              stagingPib.item.lotQty = result.getValue({ name: 'quantity' })
            }
          })
          return true
        })
      }
      log.audit({ title: 'Result LOT', details: arrStaging })
      return arrStaging
    } catch (e) {
      log.error({ title: 'Error getIdLotNumber:', details: e })
    }
  }
  function validationErrors(results) {
    try {
      var arrayErrors = new Array()
      results = results
        .map(staging => {
          if (staging.item.lot === '' && staging.item.type === 'InvtPart') {
            arrayErrors.push({ id: staging.id, item: { id: staging.item.id, name: staging.item.name }, detail: 'NOTLOT' })
            return null
          }
          if (staging.item.lot !== '' && staging.item.lotId === '' && staging.item.type === 'InvtPart') {
            arrayErrors.push({
              id: staging.id,
              item: { id: staging.item.id, name: staging.item.name, lot: staging.item.lot },
              detail: 'NOTSERIALLOT'
            })
            return null
          }
          if (staging.unit.value === '') {
            arrayErrors.push({ id: staging.id, item: { id: staging.item.id, name: staging.item.name }, detail: 'NOTUNIT' })
            return null
          }
          if (parseFloat(staging.price) < 0 || parseFloat(staging.price) === 0) {
            arrayErrors.push({ id: staging.id, item: { id: staging.item.id, name: staging.item.name }, detail: 'LOWPRICE' })
            return null
          }
          if (parseFloat(staging.qty) < 0 || parseFloat(staging.qty) === 0) {
            arrayErrors.push({ id: staging.id, item: { id: staging.item.id, name: staging.item.name }, detail: 'LOWQTY' })
            return null
          }
          if (parseFloat(staging.qty) > parseFloat(staging.item.lotQty) && staging.item.type === 'InvtPart') {
            arrayErrors.push({ id: staging.id, item: { id: staging.item.id, name: staging.item.name }, detail: 'INSQTY' })
            return null
          }
          if (staging.customer.sub !== staging.location.sub) {
            arrayErrors.push({ id: staging.id, item: { id: staging.item.id, name: staging.item.name }, detail: 'NOTMATCHSUB' })
            return null
          }
          if (staging.customer.subId !== staging.item.subId && !staging.item.subChild) {
            arrayErrors.push({ id: staging.id, item: { id: staging.item.id, name: staging.item.name }, detail: 'NOTMATCHSUB_ITEM' })
            return null
          }
          return staging
        })
        .filter(Boolean)
      log.audit({ title: 'Results after errors validation: ', details: results })
      return { arrayErrors, results }
    } catch (e) {
      log.error({ title: 'Error validationErrors:', details: e })
    }
  }
  /**
   * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
   * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
   * context.
   * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
   *     is provided automatically based on the results of the getInputData stage.
   * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
   *     function on the current key-value pair
   * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
   *     pair
   * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {string} mapContext.key - Key to be processed during the map stage
   * @param {string} mapContext.value - Value to be processed during the map stage
   * @since 2015.2
   */

  const map = mapContext => {
    try {
      log.audit({ title: 'mapContext', details: mapContext })
      let dataForInvoice = JSON.parse(mapContext.value)
      if (!dataForInvoice.hasOwnProperty('detail')) {
        let linesProcessed = []
        log.audit({ title: 'dataForInvoice', details: dataForInvoice })
        log.audit({ title: 'dataForInvoice.arrStaging', details: dataForInvoice.arrStaging })
        log.audit({ title: 'Type dataForInvoice', details: typeof dataForInvoice })

        let invoiceGenerated = record.create({ type: record.Type.INVOICE, isDynamic: true })
        invoiceGenerated.setValue({ fieldId: 'entity', value: dataForInvoice.customer })
        invoiceGenerated.setValue({ fieldId: 'location', value: dataForInvoice.location.value })
        let linesItems = dataForInvoice.arrStaging
        for (var i = 0; i < linesItems.length; i++) {
          invoiceGenerated.selectNewLine({ sublistId: 'item' })
          invoiceGenerated.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: linesItems[i].item.id })
          invoiceGenerated.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: linesItems[i].qty })
          invoiceGenerated.setCurrentSublistValue({ sublistId: 'item', fieldId: 'units', value: linesItems[i].unit.value })
          invoiceGenerated.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: linesItems[i].price })
          invoiceGenerated.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_staging_related', value: linesItems[i].id })

          if (linesItems[i].item.type === 'InvtPart') {
            var inventoryDetail = invoiceGenerated.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' })
            inventoryDetail.selectNewLine({ sublistId: 'inventoryassignment' })
            inventoryDetail.setCurrentSublistValue({
              sublistId: 'inventoryassignment',
              fieldId: 'issueinventorynumber',
              value: linesItems[i].item.lotId
            })
            inventoryDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: linesItems[i].qty })
            inventoryDetail.commitLine({ sublistId: 'inventoryassignment' })
          }

          invoiceGenerated.commitLine({ sublistId: 'item' })
        }
        let idInvoice = invoiceGenerated.save({
          enableSourcing: true,
          ignoreMandatoryFields: true
        })
        var numDoc = search.lookupFields({ type: record.Type.INVOICE, id: idInvoice, columns: ['tranid'] }).tranid
        log.audit({ title: 'numDoc', details: numDoc })
        var arrstag = dataForInvoice.idstagings
        for (var i = 0; i < arrstag.length; i++) {
          linesProcessed.push({
            id: arrstag[i].id,
            item: {
              id: arrstag[i].item.id,
              text: arrstag[i].item.name
            },
            inv: {
              id: idInvoice,
              text: numDoc
            }
          })
          record.submitFields({
            type: 'customrecord_staging',
            id: arrstag[i].id,
            values: { custrecord_staging_transaction_created: idInvoice, custrecord_weinfuse_usage_status: '4' },
            options: {
              enablesourcing: false,
              ignoreMandatotyFields: true
            }
          })
        }
        mapContext.write({
          key: mapContext.key,
          value: linesProcessed
        })
      } else {
        mapContext.write({
          key: mapContext.key,
          value: mapContext.value
        })
      }
    } catch (e) {
      log.error({ title: 'Error map:', details: e })
      mapContext.write({
        key: mapContext.key,
        value: {
          detail: 'Error to created invoice: ' + e.message
        }
      })
    }
  }

  /**
   * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
   * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
   * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
   *     provided automatically based on the results of the map stage.
   * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
   *     reduce function on the current group
   * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
   * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {string} reduceContext.key - Key to be processed during the reduce stage
   * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
   *     for processing
   * @since 2015.2
   */
  const reduce = reduceContext => {
    try {
      log.audit({ title: 'reduceContext', details: reduceContext })
      let scriptObj = runtime.getCurrentScript()
      let trackingRecordId = scriptObj.getParameter({ name: PARAMETERS_SCRIPT.ID_TRACKING_RECORD })
      let dataForTracking = JSON.parse(reduceContext.values[0])

      log.audit({ title: 'dataForTracking', details: dataForTracking })
      if (!dataForTracking.hasOwnProperty('detail')) {
        let arrStagingProcessed = []
        let trackingRecord = record.load({ type: TRACKING_RECORD.ID, id: trackingRecordId, isDynamic: true })
        arrStagingProcessed = trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_lines_processed' })
        log.audit({ title: 'Lines processed', details: trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_lines_processed' }) })
        dataForTracking.forEach(lineProcessedTracking => {
          var lineProcessed = record.create({ type: 'customrecord_tkio_lines_process_sr_tk', isDynamic: true })
          lineProcessed.setValue({ fieldId: 'custrecord_tkio_staging_id_process', value: lineProcessedTracking.id })
          lineProcessed.setValue({ fieldId: 'custrecord_tkio_staging_item_used', value: lineProcessedTracking.item.id })
          lineProcessed.setValue({ fieldId: 'custrecord_tkio_staging_trand_generated', value: lineProcessedTracking.inv.id })
          let idLineProcessed = lineProcessed.save({
            enableSourcing: true,
            ignoreMandatoryFields: true
          })
          arrStagingProcessed.push(idLineProcessed)
        })

        arrStagingProcessed = arrStagingProcessed.filter(track => track !== '')
        log.audit({ title: 'Lines processed', details: arrStagingProcessed })
        trackingRecord.setValue({ fieldId: 'custrecord_tkio_staging_lines_processed', value: arrStagingProcessed })
        trackingRecord.save({
          enableSourcing: true,
          ignoreMandatoryFields: true
        })
      } else if (dataForTracking.hasOwnProperty('id')) {
        let trackingRecord = record.load({ type: TRACKING_RECORD.ID, id: trackingRecordId, isDynamic: true })
        let arrStagingNotProcessed = []
        arrStagingNotProcessed = trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_errors' })
        log.audit({ title: 'arrStagingNotProcessed', details: arrStagingNotProcessed })
        arrStagingNotProcessed = arrStagingNotProcessed.filter(track => track !== '')

        let lineNotProcessed = record.create({ type: 'customrecord_tkio_lines_process_sr_tk', isDynamic: true })
        lineNotProcessed.setValue({ fieldId: 'custrecord_tkio_staging_id_process', value: dataForTracking.id })
        lineNotProcessed.setValue({ fieldId: 'custrecord_tkio_staging_item_used', value: dataForTracking.item.id })
        lineNotProcessed.setValue({ fieldId: 'custrecord_tkio_staging_detail_process', value: ERRORS_DETAIL[dataForTracking.detail] })

        let idLineNotProcessed = lineNotProcessed.save({
          enableSourcing: true,
          ignoreMandatoryFields: true
        })
        arrStagingNotProcessed.push(idLineNotProcessed)
        log.audit({ title: 'Lines NOT processed', details: arrStagingNotProcessed })
        trackingRecord.setValue({ fieldId: 'custrecord_tkio_staging_errors', value: arrStagingNotProcessed })
        trackingRecord.save({
          enableSourcing: true,
          ignoreMandatoryFields: true
        })
      } else {
        let trackingRecord = record.load({ type: TRACKING_RECORD.ID, id: trackingRecordId, isDynamic: true })
        let arrStagingNotProcessed = []
        arrStagingNotProcessed = trackingRecord.getValue({ fieldId: 'custrecord_tkio_staging_errors' })
        log.audit({ title: 'arrStagingNotProcessed', details: arrStagingNotProcessed })
        arrStagingNotProcessed = arrStagingNotProcessed.filter(track => track !== '')

        let lineNotProcessed = record.create({ type: 'customrecord_tkio_lines_process_sr_tk', isDynamic: true })
        lineNotProcessed.setValue({ fieldId: 'custrecord_tkio_staging_detail_process', value: dataForTracking.detail })

        let idLineNotProcessed = lineNotProcessed.save({
          enableSourcing: true,
          ignoreMandatoryFields: true
        })
        arrStagingNotProcessed.push(idLineNotProcessed)
        log.audit({ title: 'Lines NOT processed', details: arrStagingNotProcessed })
        trackingRecord.setValue({ fieldId: 'custrecord_tkio_staging_errors', value: arrStagingNotProcessed })
        trackingRecord.save({
          enableSourcing: true,
          ignoreMandatoryFields: true
        })
      }
    } catch (e) {
      log.error({ title: 'Error reduce:', details: e })
    }
  }

  /**
   * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
   * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
   * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
   * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
   *     script
   * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
   * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
   * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
   * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
   *     script
   * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
   * @param {Object} summaryContext.inputSummary - Statistics about the input stage
   * @param {Object} summaryContext.mapSummary - Statistics about the map stage
   * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
   * @since 2015.2
   */
  const summarize = summaryContext => {
    try {
      log.audit({ title: 'summaryContext', details: summaryContext })
      let linesProcessed = []
      summaryContext.output.iterator().each((key, value) => {
        log.audit({ title: 'Data', details: { key, value } })
        linesProcessed = linesProcessed.concat(JSON.parse(value))
      })
      let scriptObj = runtime.getCurrentScript()
      let trackingRecordId = scriptObj.getParameter({ name: PARAMETERS_SCRIPT.ID_TRACKING_RECORD })
      let linesProcessedText =
        JSON.stringify(linesProcessed).length < 1000000
          ? JSON.stringify(linesProcessed)
          : 'Cannot display results because it exceeds the allowed limit'
      // Update the field tracking record ('PROCESSED SUCCESSFULLY' and 'LINES PROCESSED')
      record.submitFields({
        type: TRACKING_RECORD.ID,
        id: trackingRecordId,
        values: {
          custrecord_tkio_staging_processed_succes: true
        },
        options: {
          enablesourcing: false,
          ignoreMandatotyFields: true
        }
      })
    } catch (e) {
      log.error({ title: 'Error summarize:', details: e })
    }
  }

  return { getInputData, map, reduce, summarize }
})
