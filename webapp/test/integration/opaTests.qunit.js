sap.ui.require(
    [
        'sap/fe/test/JourneyRunner',
        'fscmbenefithandler/test/integration/FirstJourney',
		'fscmbenefithandler/test/integration/pages/InsurClmSrvcsInsurClaimMain'
    ],
    function(JourneyRunner, opaJourney, InsurClmSrvcsInsurClaimMain) {
        'use strict';
        var JourneyRunner = new JourneyRunner({
            // start index.html in web folder
            launchUrl: sap.ui.require.toUrl('fscmbenefithandler') + '/index.html'
        });

       
        JourneyRunner.run(
            {
                pages: { 
					onTheInsurClmSrvcsInsurClaimMain: InsurClmSrvcsInsurClaimMain
                }
            },
            opaJourney.run
        );
    }
);