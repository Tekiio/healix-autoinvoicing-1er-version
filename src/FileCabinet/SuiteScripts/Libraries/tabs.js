/**
 * @NApiVersion 2.1
 */
define([], () => {
  const TABS = {}
  TABS.STYLE = `<style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins&display=swap');
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
        font-family: 'Poppins', sans-serif !important;
      }
      .container_custom > input {
        font-size: 22px;
        font-weight: bold;
        color: #4d5f79;
        line-height: 33px;
      }
      .tabs {
        font-family: 'Poppins', sans-serif !important;
        border-bottom: 0.9px solid #dbdbdb;
        display: flex;
        align-items: center;
        justify-content: space-around;
      }
      .tabs input {
        font-family: 'Poppins', sans-serif !important;
        padding: 1em;
        margin:0 .3em 0 .3em;
        font-size: 10pt;
        font-weight: bold;
        border-radius: 0.375em 0.375em 0 0;
        border: 1px solid transparent;
        min-width: 20vw;
        height: 45px;
        cursor: pointer;
        background-color: #f0f0f0;
        color: #7c7c7c;
        width: 70%;
      }
      .tabs input.is-active {
        background-color: #366ef6;
        border-color: #dbdbdb;
        border-bottom: 3px solid #f5ebe0;
        color: #fff;
      }
      .tabs input:hover {
        background-color: #edede9;
        color: #366ef6;
        border-bottom: 3px solid #b9b9b9;
      }
    </style>`
  TABS.BODY = `<div class="container_custom">
      <div class="tabs">
      <!--REPLACE-->
      </div>
    </div>`
  TABS.CONTENT_BASE = `<input class="$class" type="button" value="$value" id="custpage_cust_action" name="custpage_cust_action" onclick="var  rConfig =  JSON.parse( '{}' ) ; rConfig['context'] = '$clientPath'; var entryPointRequire = require.config(rConfig); entryPointRequire(['$clientPath'], function(mod){ try{    if (!!window)    {        var origScriptIdForLogging = window.NLScriptIdForLogging;        var origDeploymentIdForLogging = window.NLDeploymentIdForLogging;        window.NLScriptIdForLogging = '$scriptId';        window.NLDeploymentIdForLogging = '$deployId';    }mod.$functionName('$scriptId', '$deployId');}finally{    if (!!window)    {        window.NLScriptIdForLogging = origScriptIdForLogging;        window.NLDeploymentIdForLogging = origDeploymentIdForLogging;    }} }); return false;" />`
  TABS.CONTENT = {}
  return { TABS }
})
