sap.ui.define(
    [
        'sap/fe/core/PageController',
        'sap/ushell/Container',
        'sap/ui/core/format/NumberFormat',
		'sap/ui/model/Sorter',
        'sap/ui/core/Fragment',
        'sap/ui/Device',
        "sap/m/MessageBox",
        'sap/ui/core/BusyIndicator',
        'sap/m/GroupHeaderListItem',
        'sap/m/PDFViewer'
    ],
    function (PageController, Container, NumberFormat, Sorter, Fragment, Device, MessageBox, BusyIndicator, GroupHeaderListItem, PDFViewer) {
        'use strict';

        return PageController.extend('fscmbenefithandler.ext.main.Main', {
            /**
             * Called when a controller is instantiated and its View controls (if available) are already created.
             * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
             * @memberOf fscmbenefithandler.ext.main.Main
             */
            onInit: async function () {
                var oView = this.getView();

                this._pdfViewer = new PDFViewer({
                    isTrustedSource : true
                });
           
                oView.addDependent(this._pdfViewer);

                Fragment.load({
                    id: this.getView().getId(),
                    name: "fscmbenefithandler.ext.main.ColumnMenu",
                    controller: this
                }).then(function(oMenu) {
                    oView.addDependent(oMenu);
                    return oMenu;
                });

                // Keeps reference to any of the created sap.m.ViewSettingsDialog-s in this sample
                this._mViewSettingsDialogs = {};

                var oBpLinkModel = new sap.ui.model.json.JSONModel({value: [
                    {
                        intent: "customer",
                        action: "display",
                        name: "Customer360 - Overview"
                    },
                    {
                        intent: "bp",
                        action: "maintain",
                        name: "Business Partner - Maintain"
                    }
                ]});
			    oView.setModel(oBpLinkModel, "bpLinkModel");
            },

            getGrouping: function(oContext) {
                return oContext.getProperty('exectype');
            },

            getGroupHeader: function(oGroup) {
                var title = ""

                switch (oGroup.key) {
                    case "01":
                        title = "Eligibility Check"
                        break
                    case "02":
                        title = "Benefit Calculation"
                        break 
                    default:
                        title = "Others"
                        break
                }

                return new GroupHeaderListItem({
                    title
                })
            },

            /**
             * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
             * (NOT before the first rendering! onInit() is used for that one!).
             * @memberOf fscmbenefithandler.ext.main.Main
             */
        //   onBeforeRendering: async function() {     
        //   },

            handleClosedClaimChange: function (claimData) {
                var claimClosedText = claimData.InsuranceClaimIsStatusClosed ? "Closed" : "Open"
                var claimClosedStatus = claimData.InsuranceClaimIsStatusClosed ? "Error" : "Success"
                var claimClosedIdentifier = this.byId("claimClosed")
                claimClosedIdentifier.setText(claimClosedText)
                claimClosedIdentifier.setStatus(claimClosedStatus)
            },   
        
            filterParticipants: async function (claimDetails) {
                var claimData = claimDetails
                var participants = claimDetails?.["_InsurClmSrvcsParticipant"]
                
                if (participants === undefined) {
                    return { ...claimData, ["_InsurClmSrvcsParticipant"]: []}
                }

                const uniqueObjects = new Map();

                await participants.forEach(item => {
                    const key = `${item.BusinessPartner}-${item.InsurClmParticipantRole}`;
                    if (!uniqueObjects.has(key)) {
                        uniqueObjects.set(key, item);
                    }
                });

                var participantResult = []
                await uniqueObjects.forEach( element => participantResult.push(element))

                claimData = { ...claimData, ["_InsurClmSrvcsParticipant"]: participantResult}
                return claimData
            },

            aggregateRelationshipData: async function (relationShips, bpData) {
                if (relationShips === undefined) {
                    return []
                }

                const uniqueObjects = new Map();

                await relationShips.forEach(item => {
                    const key = `${item.BusinessPartner2}-${item.RelationshipCategory}`;
                    if (!uniqueObjects.has(key)) {
                        uniqueObjects.set(key, item);
                    }
                });

                var relationshipResult = []
                await uniqueObjects.forEach( element => relationshipResult.push(element))

                var aggregatedData = relationshipResult.map( relation => {
                    var bpDataRelation = bpData.filter( bp => bp?.BusinessPartner === relation?.BusinessPartner2)?.[0]
                    return { ...relation, BpData: bpDataRelation}
                })
                
                return aggregatedData
            },

            /**
             * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
             * This hook is the same one that SAPUI5 controls get after being rendered.
             * @memberOf fscmbenefithandler.ext.main.Main
             */
            onAfterRendering: async function () {         
                var oTableSelectedModel = new sap.ui.model.json.JSONModel({value: ""});
                this.getView().setModel(oTableSelectedModel, "oTableSelected"); 

                var oTabSelectedModel = new sap.ui.model.json.JSONModel({value: "tabClaimantDetails"});
                this.getView().setModel(oTabSelectedModel, "oTabSelectedModel");   

                //Set loading states
                this.getView().byId("relationshipsCard").setBusy(true)
                this.getView().byId("headerData").setBusy(true)
                this.getView().byId("claimantDetailsCard").setBusy(true)
                this.getView().byId("documentsCard").setBusy(true)
                this.getView().byId("incomeDetailsCard").setBusy(true)
                this.getView().byId("conscriptDetailsCard").setBusy(true)

                var URLParsing = await Container.getServiceAsync("URLParsing")
                var params = URLParsing.parseParameters(window.location.href)
                var claimNo = ""

                if (params?.InsuranceClaim?.[0]) {
                    claimNo = params?.InsuranceClaim?.[0]
                } else {
                    claimNo = params?.["sap-iframe-hint"]?.[0]?.split("=")?.[1]
                }

                if (claimNo !== "") {
                    var oMetaModel = new sap.ui.model.json.JSONModel({value: claimNo});
                    this.getView().setModel(oMetaModel, "oMetaModel");   

                    var that = this;
                    var appModulePath = jQuery.sap.getModulePath("fscmbenefithandler");

                    $.ajax({
                        type: "GET",
                        url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsInsurClaim?$expand=_InsurClmSrvcsParticipant,_InsurClmReqD,PaytIn,PaytOut,_InsurClmFutPayt,_InsurClmSrvcsBrfOutput,_InsurClmDocCorr&$filter=InsuranceClaim eq '${claimNo}'`,
                        success: async function (data) {
                            that.getView().byId("headerData").setBusy(false)

                            var filteredClaimDetails = await that.filterParticipants(data.value?.[0])

                            var oModel = new sap.ui.model.json.JSONModel({value: filteredClaimDetails});
                            that.getView().setModel(oModel, "insuranceClaimDetails");   
                            
                            if (data.value.length !== 0 && that.getView().getModel("insuranceClaimDetails").getData().value?._InsurClmSrvcsParticipant.length !== 0) {
                                that.handleClosedClaimChange(oModel.getData()?.value)              

                                // EXTRACT POLICYHOLDER FROM CLAIM AND THAN GET BP IN API CALL
                                var claimant = that.getView().getModel("insuranceClaimDetails").getData()?.value?._InsurClmSrvcsParticipant.filter( participant => participant.InsurClmParticipantRole === "CLAI")?.[0]
                                var policyHolder = that.getView().getModel("insuranceClaimDetails").getData()?.value?._InsurClmSrvcsParticipant.filter( participant => participant.InsurClmParticipantRole === "POLH")?.[0]

                                if (claimant === undefined) {
                                    that.getView().byId("relationshipsCard").setBusy(false)
                                    that.getView().byId("headerData").setBusy(false)
                                    that.getView().byId("claimantDetailsCard").setBusy(false)
                                    that.getView().byId("documentsCard").setBusy(false)
                                    that.getView().byId("incomeDetailsCard").setBusy(false)
                                    that.getView().byId("conscriptDetailsCard").setBusy(false)
                                    return
                                }

                                $.ajax({
                                    type: "GET",
                                    url: `${appModulePath}/sap/opu/odata4/sap/api_business_partner/srvd_a2x/sap/api_business_partner/0001/BusinessPartnerType?$expand=_BuPaIdentification,_BPRelationship,_BusinessPartnerAddress,_BusinessPartnerRole,_BPEmployment,_HousingExpenditure,_ClaimantData,_ConscriptData&$filter=BusinessPartner eq '${claimant.BusinessPartner}'`,
                                    
                                    success: function (data) {
                                        that.getView().byId("claimantDetailsCard").setBusy(false)

                                        var oModel = new sap.ui.model.json.JSONModel({value: data?.value?.[0]});
                                        that.getView().setModel(oModel, "businessPartnerDetails");

                                        var classifiedIncomeElements = data?.value?.[0]?.["_ConscriptData"].filter( el => el?.["UNCLASSIFIED_INCOME"] !== "X").map( incEl => incEl?.INCOME)
                                        var unclassifiedIncomeElements = data?.value?.[0]?.["_ConscriptData"].filter( el => el?.["UNCLASSIFIED_INCOME"] === "X").map( incEl => incEl?.INCOME)

                                        var initialValue = 0;
                                        var classifiedIncome = classifiedIncomeElements.reduce(
                                            (accumulator, currentValue) => accumulator + currentValue,
                                            initialValue,
                                        );

                                        var initialValueUnclassified = 0;
                                        var unclassifiedIncome = unclassifiedIncomeElements.reduce(
                                            (accumulator, currentValue) => accumulator + currentValue,
                                            initialValueUnclassified,
                                        );

                                        var oIncomeModel = new sap.ui.model.json.JSONModel({classifiedIncome: classifiedIncome, unclassifiedIncome: unclassifiedIncome});
                                        that.getView().setModel(oIncomeModel, "bpIncomeDetails");

                                        var these = that
                                        $.ajax({
                                            type: "GET",
                                            url: `${appModulePath}/sap/opu/odata4/sap/api_business_partner/srvd_a2x/sap/api_business_partner/0001/BusinessPartnerType?$expand=_BuPaIdentification,_BPRelationship,_BusinessPartnerAddress,_BusinessPartnerRole,_BPEmployment,_HousingExpenditure,_ClaimantData,_ConscriptData&$filter=BusinessPartner eq '${policyHolder.BusinessPartner}'`,
                                            
                                            success: function (data) {
                                                var relationFilter = ""
                                                var bpRelationShips = data?.value?.[0]?._BPRelationship

                                                var oBpPolhModel = new sap.ui.model.json.JSONModel({value: data?.value?.[0]});
                                                that.getView().setModel(oBpPolhModel, "businessPartnerPolhDetails");
                                                
                                                var bpConscriptRole = data?.value?.[0]?.["_BusinessPartnerRole"].filter( role => role.BusinessPartnerRole === "ZCONSR")?.[0]
                                                var oBpRoleModel = new sap.ui.model.json.JSONModel({value: bpConscriptRole});
                                                that.getView().setModel(oBpRoleModel, "businessPartnerConscriptRole");

                                                var those = these
                                                if (bpRelationShips.length !== 0) {
                                                    bpRelationShips.forEach((relation, index, arr) => {
                                                        if (index === 0) {
                                                            relationFilter = relationFilter + `BusinessPartner eq '${relation.BusinessPartner2}'`
                                                        } else {
                                                            relationFilter = relationFilter + `or BusinessPartner eq '${relation.BusinessPartner2}'`
                                                        }

                                                        if (index === arr.length - 1){ 
                                                            $.ajax({
                                                                type: "GET",
                                                                url: `${appModulePath}/sap/opu/odata4/sap/api_business_partner/srvd_a2x/sap/api_business_partner/0001/BusinessPartnerType?$expand=_BuPaIdentification,_BPRelationship,_ClaimantData,_ConscriptData&$filter=${relationFilter}`,
                                                                success: function (data) {         
                                                                    those.getView().byId("relationshipsCard").setBusy(false)
                                                                    those.getView().byId("headerData").setBusy(false)
                                                                    those.getView().byId("claimantDetailsCard").setBusy(false)
                                                                    those.getView().byId("documentsCard").setBusy(false)
                                                                    those.getView().byId("incomeDetailsCard").setBusy(false)
                                                                    those.getView().byId("conscriptDetailsCard").setBusy(false)

                                                                    those.aggregateRelationshipData( bpRelationShips, data.value).then( result => {
                                                                        var relationModel = new sap.ui.model.json.JSONModel({value: result});
                                                                        those.getView().setModel(relationModel, "relationsOfBp");  
                                                                    })
                                                                },
                                                                error: function (error) {
                                                                    those.getView().byId("relationshipsCard").setBusy(false)
                                                                    those.getView().byId("headerData").setBusy(false)
                                                                    those.getView().byId("claimantDetailsCard").setBusy(false)
                                                                    those.getView().byId("documentsCard").setBusy(false)
                                                                    those.getView().byId("incomeDetailsCard").setBusy(false)
                                                                    those.getView().byId("conscriptDetailsCard").setBusy(false)

                                                                    MessageBox.error(error?.responseJSON.error.message)
                                                                },
                                                        })
                                                    }
                                                    return                
                                                })
                                            } else {
                                                that.getView().byId("relationshipsCard").setBusy(false)
                                                that.getView().byId("headerData").setBusy(false)
                                                that.getView().byId("claimantDetailsCard").setBusy(false)
                                                that.getView().byId("documentsCard").setBusy(false)
                                                that.getView().byId("incomeDetailsCard").setBusy(false)
                                                that.getView().byId("conscriptDetailsCard").setBusy(false)
                                            }
                                            },
                                            error: function (error) {
        
                                            }
                                        })
                                },
                                error: function (error) {
                                    that.getView().byId("relationshipsCard").setBusy(false)
                                    that.getView().byId("headerData").setBusy(false)
                                    that.getView().byId("claimantDetailsCard").setBusy(false)
                                    that.getView().byId("documentsCard").setBusy(false)
                                    that.getView().byId("incomeDetailsCard").setBusy(false)
                                    that.getView().byId("conscriptDetailsCard").setBusy(false)

                                    MessageBox.error(error?.responseText)

                                }
                            });
                            } else {
                                that.getView().byId("relationshipsCard").setBusy(false)
                                that.getView().byId("headerData").setBusy(false)
                                that.getView().byId("claimantDetailsCard").setBusy(false)
                                that.getView().byId("documentsCard").setBusy(false)
                                that.getView().byId("incomeDetailsCard").setBusy(false)
                                that.getView().byId("conscriptDetailsCard").setBusy(false)
                            }   
                        },
                        error: function (error) {
                            that.getView().byId("relationshipsCard").setBusy(false)
                            that.getView().byId("headerData").setBusy(false)
                            that.getView().byId("claimantDetailsCard").setBusy(false)
                            that.getView().byId("documentsCard").setBusy(false)
                            that.getView().byId("incomeDetailsCard").setBusy(false)
                            that.getView().byId("conscriptDetailsCard").setBusy(false)

                            MessageBox.error(error?.responseJSON.error.message)
                        }
                    });     
                }
            },

            onSelectTabFilter: function (e) {
                var tabId = e?.mParameters?.selectedKey.split("--")?.[1]
                var actionButton = this.getView().byId("buttonAction")
                this.getView().getModel("oTabSelectedModel").setData({value: tabId})

                switch(tabId) {
                    case "tabClaimantDetails":
                        actionButton.setEnabled(true)
                        actionButton.setText("Check Eligibility")
                        break
                    case "tabBenefitCalculation":
                        if (this.getView().getModel("selectedProcurement") === undefined) {
                            actionButton.setEnabled(false)
                        }
                        actionButton.setText("Calculate Benefits")
                        break
                    case "tabBrfPlusLogs":
                        actionButton.setEnabled(true)
                        actionButton.setText("Check Eligibility")
                        break
                    case "tabPayments":
                        if (this.getView().getModel("selectedRecovery") === undefined) {
                            actionButton.setEnabled(false)
                        }
                        actionButton.setText("Create Recovery")
                        break
                    default:
                        break
                }
            },

            createRecovery: async function() {
                if (this.getView().getModel("selectedRecovery") === undefined) {
                    MessageBox.error("First select a Payment");
                    return
                }

                this.getView().byId("recoveryTable").setBusy(true)

                var selectedRecovery = this.getView().getModel("selectedRecovery").getData()
                var that = this;
                var appModulePath = jQuery.sap.getModulePath("fscmbenefithandler");
                var csrfToken = ""

                await $.ajax({
                    type: "GET",
                    contentType: "application/json",
                    headers: {
                        "x-csrf-token": "fetch"
                    },
                    url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsSubclmPayt`,
                    success: function (data, textStatus, jqXHR) {
                        var headers = jqXHR.getAllResponseHeaders();
                        var headersObj = {};
                        headers.split('\n').forEach(function(header) {
                            var parts = header.split(': ');
                            if (parts.length === 2) {
                                headersObj[parts[0]] = parts[1];
                            }
                        });

                        that.csrfToken = headersObj?.["x-csrf-token"]
                    },
                    error: function (error) {
                        MessageBox.error(error?.responseJSON.error.message)
                        that.getView().byId("recoveryTable").setBusy(false)
                    }
                })

                if (that.csrfToken !== "") {
                    await $.ajax({
                        type: "PATCH",
                        contentType: "application/json",
                        headers: {
                            "x-csrf-token": that.csrfToken
                        },
                        data: JSON.stringify({
                            InsurClmPaymentIsParked: false
                        }),
                        url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsSubclmPayt/${selectedRecovery?.InsuranceClaim}/${selectedRecovery?.Subclaim}/${selectedRecovery?.Payment}`,
                        success: function (data) {
                            console.log(data)
                            var these = that
                            var claim = that.getView().getModel("oMetaModel").getData()?.value
                            $.ajax({
                                type: "GET",
                                url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsInsurClaim?$expand=_InsurClmSrvcsParticipant,_InsurClmReqD,PaytIn,PaytOut,_InsurClmFutPayt,_InsurClmSrvcsBrfOutput,_InsurClmDocCorr&$filter=InsuranceClaim eq '${claim}'`,
                                success: function (data) {
                                    these.getView().byId("headerData").setBusy(false)
                                    var oModel = new sap.ui.model.json.JSONModel({value: data.value?.[0]});
                                    these.getView().setModel(oModel, "insuranceClaimDetails");   
                                    these.getView().byId("recoveryTable").setBusy(false)
                                    
                                    MessageBox.success("Recovery payment has been created");
                                },
                                error: function (error) {
                                    these.getView().byId("recoveryTable").setBusy(false)
                                    MessageBox.error(error?.responseJSON.error.message)
                                }
                            })
                        },
                        error: function (error) {
                            console.log(error)
                            that.getView().byId("recoveryTable").setBusy(false)
                            MessageBox.error(error?.responseJSON.error.message)
                        }
                    })
                }
            },

            calculateBenefits: async function() {
                if (this.getView().getModel("selectedProcurement") === undefined) {
                    MessageBox.error("First select a Procurement");
                    return
                }

                this.getView().byId("idProcurementsTable").setBusy(true)

                var selectedProcure = this.getView().getModel("selectedProcurement")?.getData()
                var that = this;
                var appModulePath = jQuery.sap.getModulePath("fscmbenefithandler");
                var csrfToken = ""

                await $.ajax({
                    type: "GET",
                    contentType: "application/json",
                    headers: {
                        "x-csrf-token": "fetch"
                    },
                    url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsProcure`,
                    success: function (data, textStatus, jqXHR) {
                        var headers = jqXHR.getAllResponseHeaders();
                        var headersObj = {};
                        headers.split('\n').forEach(function(header) {
                            var parts = header.split(': ');
                            if (parts.length === 2) {
                                headersObj[parts[0]] = parts[1];
                            }
                        });

                        that.csrfToken = headersObj?.["x-csrf-token"]
                    },
                    error: function (error) {
                        console.log(error)
                        that.getView().byId("idProcurementsTable").setBusy(false)
                    }
                })

                if (that.csrfToken !== "") {
                    await $.ajax({
                        type: "PATCH",
                        contentType: "application/json",
                        headers: {
                            "x-csrf-token": that.csrfToken
                        },
                        data: JSON.stringify({
                            "CalculateBenefit": true
                        }),
                        url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsProcure/${selectedProcure?.InsuranceClaim}/${selectedProcure?.SubClaim}/${selectedProcure?.ProcurementId}`,
                        success: function (data) {
                            console.log(data)
                            var these = that
                            var claim = that.getView().getModel("oMetaModel").getData()?.value
                            $.ajax({
                                type: "GET",
                                url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsInsurClaim?$expand=_InsurClmSrvcsParticipant,_InsurClmReqD,PaytIn,PaytOut,_InsurClmFutPayt,_InsurClmSrvcsBrfOutput,_InsurClmDocCorr&$filter=InsuranceClaim eq '${claim}'`,
                                success: function (data) {
                                    var oModel = new sap.ui.model.json.JSONModel({value: data.value?.[0]});
                                    these.getView().setModel(oModel, "insuranceClaimDetails");   

                                    these.getView().byId("idProcurementsTable").setBusy(false)
                                    MessageBox.success("Benefits calculated succesfully");
                                },
                                error: function (error) {
                                    these.getView().byId("idProcurementsTable").setBusy(false)
                                    MessageBox.error("Something went wrong!")
                                }
                            })
                        },
                        error: function (error) {
                            that.getView().byId("idProcurementsTable").setBusy(false)
                            MessageBox.error(error?.responseJSON.error.message)
                        }
                    })
                }
            },
            
            checkEligibility: async function () {
                console.log("IN")
                this.getView().byId("iconTabBar").setSelectedKey("fscmbenefithandler::InsurClmSrvcsInsurClaimMain--tabBrfPlusLogs")
                this.getView().byId("idBrfTable").setBusy(true)

                var that = this;
                var appModulePath = jQuery.sap.getModulePath("fscmbenefithandler");
                var csrfToken = ""
                var claimNo = this.getView().getModel("oMetaModel")?.getData()?.value

                await $.ajax({
                    type: "GET",
                    contentType: "application/json",
                    headers: {
                        "x-csrf-token": "fetch"
                    },
                    url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsInsurClaim`,
                    success: function (data, textStatus, jqXHR) {
                        var headers = jqXHR.getAllResponseHeaders();
                        var headersObj = {};
                        headers.split('\n').forEach(function(header) {
                            var parts = header.split(': ');
                            if (parts.length === 2) {
                                headersObj[parts[0]] = parts[1];
                            }
                        });

                        that.csrfToken = headersObj?.["x-csrf-token"]
                    },
                    error: function (error) {
                        MessageBox.error(error)
                        that.getView().byId("idBrfTable").setBusy(false)
                    }
                })

                if (that.csrfToken !== "") {
                    await $.ajax({
                        type: "PATCH",
                        contentType: "application/json",
                        headers: {
                            "x-csrf-token": that.csrfToken
                        },
                        data: JSON.stringify({
                            InsuranceClaimActivityCategory: "02",
                            Fcode: "ICL_CHECKELIGIBLE"
                        }),
                        url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsInsurClaim/${claimNo}`,
                        success: function (data) {
                            console.log(data)
                            var these = that
                            var claim = that.getView().getModel("oMetaModel").getData()?.value
                            $.ajax({
                                type: "GET",
                                url: `${appModulePath}/sap/opu/odata4/sap/api_insurclaimsrvcsclaim/srvd_a2x/sap/insuranceclaimsservices/0001/InsurClmSrvcsInsurClaim?$expand=_InsurClmSrvcsParticipant,_InsurClmReqD,PaytIn,PaytOut,_InsurClmFutPayt,_InsurClmSrvcsBrfOutput,_InsurClmDocCorr&$filter=InsuranceClaim eq '${claim}'`,
                                success: function (data) {
                                    var oModel = new sap.ui.model.json.JSONModel({value: data.value?.[0]});
                                    these.getView().setModel(oModel, "insuranceClaimDetails");   

                                    these.getView().byId("idBrfTable").setBusy(false)
                                    MessageBox.success("Eligibility check completed");
                                },
                                error: function (error) {
                                    MessageBox.error("Something went wrong!")
                                    these.getView().byId("idBrfTable").setBusy(false)
                                }
                            })
                        },
                        error: function (error) {
                            MessageBox.error(error?.responseJSON.error.message)
                            that.getView().byId("idBrfTable").setBusy(false)
                        }
                    })
                }
            },

            handleButtonPress: function () {
                var selectedTab = this.getView().getModel("oTabSelectedModel").getData().value

                switch(selectedTab) {
                    case "tabClaimantDetails":
                        this.checkEligibility()
                        break
                    case "tabBenefitCalculation":
                        this.calculateBenefits()
                        break
                    case "tabBrfPlusLogs":
                        this.checkEligibility()
                        break
                    case "tabPayments":
                        this.createRecovery()
                        break
                    default:
                        break
                }
            },

            handleRecoverySelect: function (oEvent) {
                var oTable = oEvent.getSource();
                var oSelectedItem = oTable.getSelectedItem();
                
                if (oSelectedItem) {
                    var oContext = oSelectedItem.getBindingContext("insuranceClaimDetails");
                    var oSelectedObject = oContext.getObject();

                    var lengthLeadingZeros = 5 - oSelectedObject.InsurClmPayt.length
                    var paymentId = oSelectedObject.InsurClmPayt
                    for (var i = 0; i < lengthLeadingZeros; i++) {
                        paymentId = "0" + paymentId
                    }

                    var oRecovModel = new sap.ui.model.json.JSONModel({
                        InsuranceClaim: oSelectedObject.InsuranceClaim,
                        Subclaim: oSelectedObject.InsurClmSubclm,
                        Payment: paymentId
                    });
                    this.getView().setModel(oRecovModel, "selectedRecovery");  
                    this.getView().byId("buttonAction").setEnabled(true)
                }
            },

            handleProcureSelect: function (oEvent) {
                var oTable = oEvent.getSource();
                var oSelectedItem = oTable.getSelectedItem();
                
                if (oSelectedItem) {
                    var oContext = oSelectedItem.getBindingContext("insuranceClaimDetails");
                    var entityPath = oContext?.sPath
                    var oSelectedObject = oContext.getObject(entityPath);
                    
                    var lengthLeadingZeros = 4 - oSelectedObject.InsuranceClaimProcurementID.length
                    var procureId = oSelectedObject.InsuranceClaimProcurementID
                    for (var i = 0; i < lengthLeadingZeros; i++) {
                        procureId = "0" + procureId
                    }

                    var oProcureModel = new sap.ui.model.json.JSONModel({
                        InsuranceClaim: oSelectedObject?.InsuranceClaim,
                        SubClaim: oSelectedObject?.InsurClmPaymentSubclaim,
                        ProcurementId: procureId
                    });

                    this.getView().byId("buttonAction").setEnabled(true)
                    this.getView().setModel(oProcureModel, "selectedProcurement");  
                }
            },

            combineAmountCurrency: function (sAmount, sCurrency, sExectype) {
                if (sExectype === "01") {
                    return ""
                }
                var oCurrencyFormat = NumberFormat.getCurrencyInstance();
                return oCurrencyFormat.format(sAmount, sCurrency); 
            },

            showRentReason: function (reason) {
                if (this.getView().getModel("businessPartnerDetails").getData()?.value?._ConscriptData.length === 0) {
                    return ""
                }

                var reasonText = ""
                switch (reason) {
                    case "001":
                        reasonText = "Moving in with a married/registered partner"
                        break
                    case "002":
                        reasonText = "Starting studies or work in a place other than your hometown"
                        break
                    case "003":
                        reasonText = "Getting an apartment after a long wait"
                        break
                    default:
                        reasonText = "Other reason"
                        break
                }

                return reasonText
            },

            showRentDetails: function (details) {
                if (this.getView().getModel("businessPartnerDetails").getData()?.value?._ConscriptData.length === 0) {
                    return ""
                }

                var detailsText = ""
                switch (details) {
                    case "01":
                        detailsText = "House"
                        break
                    case "02":
                        detailsText = "Apartment"
                        break
                    case "03":
                        detailsText = "Shared Apartment"
                        break
                    default:
                        detailsText = "Other reason"
                        break
                }

                return detailsText
            },

            showRentType: function (type) {
                var typeText = ""
                switch (type) {
                    case "01":
                        typeText = "Rent"
                        break
                    case "02":
                        typeText = "Ownership"
                        break
                    case "03":
                        typeText = "Right-of-Occupancy"
                        break
                    case "04":
                        typeText = "Co-Ownership"
                        break
                    default:
                        typeText = "Other reason"
                        break
                }

                return typeText
            },

            showEndService: function (endService) {
                var endServiceDate = new Date(endService)
                var borderData = new Date("12/31/9999")
                if (endServiceDate >= borderData) {
                    this.getView().byId("endService").setVisible(false)
                }

                return endService
            },

            handleShowBpCategory: function (categoryNo) {
                console.log(categoryNo)
                var categoryText = ""
                switch (categoryNo) {
                    case "1":
                        categoryText = "Person"
                        break
                    case "2":
                        categoryText = "Organization"
                        break
                    case "3":
                        categoryText = "Group"
                        break
                }

                return categoryText
            },

            getViewSettingsDialog: function (sDialogFragmentName) {
                var pDialog = this._mViewSettingsDialogs[sDialogFragmentName];
    
                if (!pDialog) {
                    pDialog = Fragment.load({
                        id: this.getView().getId(),
                        name: sDialogFragmentName,
                        controller: this
                    }).then(function (oDialog) {
                        if (Device.system.desktop) {
                            oDialog.addStyleClass("sapUiSizeCompact");
                        }
                        return oDialog;
                    });
                    this._mViewSettingsDialogs[sDialogFragmentName] = pDialog;
                }
                return pDialog;
            },

            handleSortButtonPressed: function (oEvent) {
                var oTableId = oEvent.oSource.oParent.oParent.sId.split("--")[1]
                var fragmentId = ""
                this.getView().getModel("oTableSelected").setData({value: oTableId})

                switch (oTableId) {
                    case "upcomingTable":
                        fragmentId = "fscmbenefithandler.ext.main.SortDialogUpcoming"
                        break
                    case "outgoingTable":
                        fragmentId = "fscmbenefithandler.ext.main.SortDialogOutgoing"
                        break
                    case "recoveryTable":
                        fragmentId = "fscmbenefithandler.ext.main.SortDialog"
                        break
                    default:
                        break
                }

                this.getViewSettingsDialog(fragmentId)
                    .then(function (oViewSettingsDialog) {
                        oViewSettingsDialog.open();
                    });
            },

            handleSortDialogConfirm: function (oEvent) {
                var tableId = this.getView().getModel("oTableSelected").getData().value
                var oTable = this.byId(tableId),
                    mParams = oEvent.getParameters(),
                    oBinding = oTable.getBinding("items"),
                    sPath,
                    bDescending,
                    aSorters = [];
    
                sPath = mParams.sortItem.getKey();
                bDescending = mParams.sortDescending;
                aSorters.push(new Sorter(sPath, bDescending));
    
                // apply the selected sort and group settings
                oBinding.sort(aSorters);
            },

            handleNavigateExpertView: function() {
                var claimMetadata = this.getView().getModel("oMetaModel")?.getData()?.value
                var oCrossAppNav = sap.ushell.Container.getService("CrossApplicationNavigation"); 
            
                oCrossAppNav.toExternal({
                    target : { semanticObject : "InsuranceClaim", action : "changeExpertMode" },
                    params : { "InsuranceClaim" : claimMetadata }
                });    
            },

            handleNavigateBp: function(oEvent) {
                var oView = this.getView()
                if (oView.getModel("oCurrBpModel") === undefined) {
                    var oCurrBpModel = new sap.ui.model.json.JSONModel({value: 0});
                    this.getView().setModel(oCurrBpModel, "oCurrBpModel"); 
                }

                var oLink = oEvent.getSource();
                var bpNumber = ""
                var elementProperties = Object.keys(oLink.mProperties)
                
                if (elementProperties.includes("subtitle")) {
                    bpNumber = oLink.getProperty("subtitle")
                } else {
                    bpNumber = oLink.getProperty("text")
                }

                this.getView().getModel("oCurrBpModel").setData({value: bpNumber});   

                if (!this._pPopover) {
                    this._pPopover = Fragment.load({
                        id: oView.getId(),
                        name: "fscmbenefithandler.ext.main.Popover",
                        controller: this
                    }).then(function(oPopover){
                        oView.addDependent(oPopover);
                        return oPopover;
                    });
                }
    
                this._pPopover.then(function(oPopover){
                    oPopover.openBy(oLink);
                });
            },
            
            handleBpNavigationSelect: function (oEvent) {
                var oCrossAppNav = sap.ushell.Container.getService("CrossApplicationNavigation"); 

                var oLink = oEvent.getSource();
                var intent = oLink.getProperty("title")

                var bpNo = this.getView().getModel("oCurrBpModel").getData()?.value
                
                if (intent.startsWith("Business")) {
                    oCrossAppNav.toExternal({
                        target : { semanticObject : "BusinessPartner", action : "maintain" },
                        params : { 
                                    BusinessPartner : bpNo
                                }
                    });  
                } else {
                    oCrossAppNav.toExternal({
                        target : { semanticObject : "cutomer", action : "display" },
                        params : {  BPIdentificationNumber: "",
                                    BusinessPartner : bpNo
                                }
                    });  
                }
            },

            handleNavigateDocument: function(oEvent) {
                var oLink = oEvent.getSource();
                var documentNumber = oLink.getProperty("text")

                var oCrossAppNav = sap.ushell.Container.getService("CrossApplicationNavigation"); 
                
                var oLink = oEvent.getSource();
                oCrossAppNav.toExternal({
                    target : { semanticObject : "CAClearingDocument", action : "display" },
                    params : { "CAClearingDocument" : documentNumber }
                });   
            },

            handleOpenPdf: function(oEvent) {
                var appModulePath = jQuery.sap.getModulePath("fscmbenefithandler");

                var oLink = oEvent.getSource();
                var documentName = oLink.getProperty("title")

                var docObj = this.getView().getModel("docObjectModel")?.getData()?.value.filter( doc => doc.name === documentName)?.[0];
                
                this._pdfViewer.setSource(appModulePath + "/browser/6227f3ab-7b57-4bac-8c0e-0e3c56d9b1da/root?cmisselector=content&objectId=" + docObj.id);
                this._pdfViewer.setTitle(docObj.name);

                this._pdfViewer.open();
                this._pdfViewer.getParent().addStyleClass("pdf-viewer-sizing")
            },

            handleShowDmsDocuments: async function (oEvent) {
                var oView = this.getView()
                var oLink = oEvent.getSource();
                var appModulePath = jQuery.sap.getModulePath("fscmbenefithandler");

                var claimNo = this.getView().getModel("oMetaModel").getData()?.value

                $.ajax({
                    url: appModulePath + "/browser/6227f3ab-7b57-4bac-8c0e-0e3c56d9b1da/root/CLAIM/" + claimNo,
                    method: "GET",
                    success: function (data) {
                        var objects = data?.objects.map( doc => {
                            return {
                                id: doc?.object?.properties?.["cmis:objectId"]?.value,
                                name: doc?.object?.properties?.["cmis:name"]?.value
                            }
                        })

                        var oDocObjectModel = new sap.ui.model.json.JSONModel({value: objects});
                        oView.setModel(oDocObjectModel, "docObjectModel");

                        if (!this._pPopover) {
                            this._pPopover = Fragment.load({
                                id: oView.getId(),
                                name: "fscmbenefithandler.ext.main.PopoverDocuments",
                                controller: this
                            }).then(function(oPopover){
                                oView.addDependent(oPopover);
                                return oPopover;
                            });
                        }
            
                        this._pPopover.then(function(oPopover){
                            oPopover.openBy(oLink);
                        });
                    }.bind(this),
                    error: function (xhr, status, error) {
                        MessageBox.information("No Documents found!")
                    }
                });
            }
        });
    }
);
