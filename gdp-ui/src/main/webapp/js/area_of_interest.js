var AOI = function() {
    var _HTML_ID = 'area-of-interest';
    var _AOI_SERVICES_BUTTON = '.aoi-services-button';
    var _AVAILABLE_ATTRIBUTES = '#available-attributes';
    var _AVAILABLE_ATTRIBUTE_VALUES = '#available-attribute-values';
    var _AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX = '#available-attribute-values-selectbox';
    var _AVAILABLE_ATTRIBUTES_SELECTBOX = '#available-attributes-selectbox';
    var _AOI_SELECTBOX = '#aoi-selectbox';
    var _CLEAR_AOI_BUTTON = '#clear-aoi-button';
    var _CLEAR_DRAW_FEATURE_BUTTON = '#clearDrawFeatureButton';
    var _SUBMIT_DRAW_FEATURE_BUTTON = '#submitDrawFeatureButton';
    var _ATTRIBUTE_BOUNDS = {
        lowerCorner : '-180 -90',
        upperCorner : '180 90'
    };
    
    // Maps attribute values to the GML IDs of the features that have those values.
    // The associated IDs of a value are at the same index in the IDs array as the
    // value is in the values array. Each element of IDs is an array.
    var valueToIDsMap = {
        values: [], 
        IDs: []
    };

    var aoiHasAttributes;
    
    function populateFeatureTypesSelectbox(data) {
        logger.debug("GDP: Populating feature types select box.");
        // Clear the selectbox of any options
        $(_AOI_SELECTBOX).empty();

        // Fix IE not properly parsing the returned XML
        if (data.xml) {
            data = $.xmlDOM(data.xml);
        }

        $(data).find('FeatureType > Name').each(function(index, element) {
            var name = $(element).text();
            $(_AOI_SELECTBOX).append(
                $(Constant.optionString).attr('value', name).html(name)
                );
        });
        
    }

    function populateAttributesSelectbox(data) {
        $(_AVAILABLE_ATTRIBUTES_SELECTBOX).empty();

        var selectedFeatureType = $(_AOI_SELECTBOX).val();

        // If selection got changed while the ajax request was happening
        if (!selectedFeatureType) return;

        $(data).find('xsd|element').each(function(i,e) {
            var text = $(e).attr('name');

            var featureTypeWithoutNamespace = selectedFeatureType.substring(selectedFeatureType.indexOf(':') + 1);

            // GeoServer returns 'the_geom' and the data store name in addition
            // to the other attributes. Do not put these in the select box.
            if (text != 'the_geom' && text != featureTypeWithoutNamespace) {
                $(_AVAILABLE_ATTRIBUTES_SELECTBOX).append(
                    $(Constant.optionString).attr('value', text).html(text)
                    );
            }
        });

        $(_AVAILABLE_ATTRIBUTES).fadeIn(Constant.ui.fadespeed);
    }

    function populateAttributeValuesSelectbox(data) {
        // Clear the selectbox of any options
        $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).empty();

        // Clear IDs and values
        valueToIDsMap.IDs = [];
        valueToIDsMap.values = [];

        // Do not add duplicate values to the select box. Keep an array of feature
        // ID's, where valueToIDsMap.IDs[i] = array of ID's with value valueToIDsMap.values[i].
        $(data).find('gml|featureMembers').children().each(function(i,e) {
            var ID = $(e).attr('gml:id');
            var value = $(e).text();

            var index = $.inArray(value, valueToIDsMap.values);
            if (index != -1) {
                valueToIDsMap.IDs[index].push(ID);
            } else {
                valueToIDsMap.IDs.push([ID]);
                valueToIDsMap.values.push(value);
            }
        });

        $(NEXT_BUTTON).button('option', 'disabled', false);

        // http://internal.cida.usgs.gov/jira/browse/GDP-205
        var numberOfFeatures = valueToIDsMap.values.length;
        var maxNumberOfFeaturesReached = numberOfFeatures > parseInt(Constant.ui.view_max_polygons_shown);
        if (maxNumberOfFeaturesReached && !parseInt(Constant.ui.view_show_beyond_max_polygons)) {
            // We have gone beyond the amount of polygons we're allowed to show
            // on the front end.  We will only insert one item into the list
            // and select it.  When building the submit XML, the logic checks
            // to see if all attribute values are selected and if so, submits a
            // request that includes none of them (which to the WPS process
            // means use all of them).
            $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).append(
                $(Constant.optionString).attr('value', '*').html('*')
                );
            $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).children().each(function(i, e) {
                $(e).attr('selected', 'selected');
            });
            
            showNotification("Too many attribute values to display. All polygons will be used for processing");
            return this;
        }

        for (var i = 0; i < valueToIDsMap.values.length; i++) {
            var value = valueToIDsMap.values[i];

            $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).append(
                $(Constant.optionString).attr('value', value).html(value)
                );
        }

        sortListbox(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX);

        // Select all elements in the listbox
        $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).children().each(function(i, e) {
            $(e).attr('selected', 'selected');
        });

        $(_AVAILABLE_ATTRIBUTE_VALUES).fadeIn(Constant.ui.fadespeed);
        return this;
    }

    function initUploader() {
        var uploader = new qq.FileUploaderBasic({
            button: $('#fileInputButton')[0],
            allowedExtensions: ['zip'],
            params : {
                'utilitywps' : Constant.endpoint.utilitywps,
                'wfs-url' : Constant.endpoint.geoserver,
                'maxfilesize' : Constant.ui.max_upload_size
            },
            debug: true,
            action: 'uploadhandler',
            sizeLimit: Constant.ui.max_upload_size, // Doesn't work in IE
            onComplete: function(id, fileName, data) {
                hideThrobber();

                AOI.releaseToggleButton($('#uploadButton')[0]);

                // Get root of XML doc
                var response = $(data).children().first();
                
                if (response[0].nodeName == "wpsResponse") {
                    // Convert raw text into XML DOM object
                    var wpsResponse = $.xmlDOM($(response).text());
                    if (!WPS.checkWpsResponse(wpsResponse, 'Error uploading file.')) return;
                    var resultText;
                    var featureType;
                    if ($.browser.msie) {
                        featureType = $(wpsResponse).find('ns1|Identifier:contains("featuretype")').siblings().find('ns|Data').find('ns|LiteralData').text();
                        resultText = $(wpsResponse).find('ns1|Identifier:contains("result")').siblings().find('ns|Data').find('ns|LiteralData').text();
                    }
                    else {
                        featureType = $(wpsResponse).find('ns1|Identifier:contains("featuretype") ~ ns|Data > ns|LiteralData').text();
                        resultText = $(wpsResponse).find('ns1|Identifier:contains("result") ~ ns|Data > ns|LiteralData').text();
                    }
                    
                    AOI.updateFeatureTypesListAndSelect(featureType);

                    if (resultText.toLowerCase().contains('warning')) {
                        showWarningNotification(resultText);
                    }
                    showNotification('File successfully uploaded');
                } else if (response[0].nodeName == "error") {
                    showErrorNotification("Error uploading file: " + $(response).text());
                } else {
                    showErrorNotification("Error uploading file: unknown response from server");
                }
            },
            onSubmit: function() {
                showThrobber();
            }
        });
    }

    /**
     * Sets up the Waters and Upload controls on the page based on configuration options
     */
    function setupShapefileServices() {
        logger.debug("GDP: Setting up shapefile controls.");
        var servicesMap = {
            'uploadButton' : {
                config_key : 'view_show_service_upload',
                all_elements : '#upload-button-container',
                input_elements : '#upload-input-cell',
                tips : '#upload-tooltip-text'
            },
            'watersButton' : {
                config_key : 'view_show_service_waters',
                all_elements : '#waters-button-container',
                input_elements : '#featuretype-name-input-cell',
                tips : '#waters-tooltip-text',
                on_depress : function() {
                    deselectFeatureType();
                    activateWatersControl();
                },
                on_release : deactivateWatersControl
            },
            'drawFeatureButton' : {
                config_key : 'view_show_service_draw_feature',
                all_elements : '#draw-feature-button-container',
                input_elements : ['#featuretype-name-input-cell', '#clear-input-cell',
                '#submit-input-cell'],
                tips : '#draw-feature-tooltip-text',
                on_depress : function() {
                    deselectFeatureType();
                    activateDrawFeature();
                    showInformationalNotification(
                        "<center><h4>How To Draw A Polygon</h4></center>Begin drawing your polygon by clicking on the map.<br /><br />Subsequent clicks create polygon points.<br /><br />Double click to finish your polygon.", 
                        true
                        );
                },
                on_release : function() {
                    deactivateDrawFeature();
                    $.jGrowl('close');
                }
            }
        };

        for (var key in servicesMap) {
            var service = servicesMap[key];
            
            // Setup tooltips
            $(service.all_elements + ' a').attr('title', $(service.tips).html());

            if (!parseInt(Constant.ui[service.config_key])) {
                $(service.all_elements).hide();
            }
        }

        // Tell Tiptip to reload tooltip text
        initializeTips();

        $(_AOI_SERVICES_BUTTON).click(function(eventObject) {

            function buttonDown(elem) {
                if (!elem) return;

                $(elem).attr('depressed', 'true');
                $(elem).css('background-color', '#aaa');
                $(elem).addClass('ui-button-disabled ui-state-disabled')

                var service = servicesMap[$(elem).attr('id')];

                $(service.input_elements).each(function(index, elem) {
                    $(elem).css('visibility', 'visible');
                });

                if (service.on_depress)
                    service.on_depress();
            }

            function buttonUp(elem) {
                if (!elem) return;

                $(elem).attr('depressed', 'false');
                $(elem).css('background-color', '');
                $(elem).removeClass('ui-button-disabled ui-state-disabled')

                var service = servicesMap[$(elem).attr('id')];

                $('#services-input-cells').children().css('visibility', 'hidden');

                if (service.on_release)
                    service.on_release();
            }

            // Whether user is toggling up the currently depressed button
            var alreadyDepressed = isDepressed(this);

            buttonUp($(_AOI_SERVICES_BUTTON + '[depressed="true"]')[0]);

            if (!alreadyDepressed && $(this).hasClass('toggle'))
                buttonDown(this);
        });

        $(_SUBMIT_DRAW_FEATURE_BUTTON).button({
            'label':'Submit'
        });
        $(_SUBMIT_DRAW_FEATURE_BUTTON).click(submitDrawFeature);
        
        $(_CLEAR_DRAW_FEATURE_BUTTON).button({
            'label' : 'Clear Polygon'
        });
        $(_CLEAR_DRAW_FEATURE_BUTTON).click(clearDrawFeatureLayer);

        // If we are configured for uploading shapefiles
        if (parseInt(Constant.ui[servicesMap['uploadButton'].config_key])) initUploader();
    }

    function isDepressed(button) {
        // Whether user is toggling up the currently depressed button
        return button == $(_AOI_SERVICES_BUTTON + '[depressed="true"]')[0];
    }

    function updateFeatureTypesList(callback) {
        WFS.callWFS({
            'request' : 'GetCapabilities'
        },
        true,
        function(data) {
            populateFeatureTypesSelectbox(data);
            if (callback) callback();
        });
    }

    function selectFeatureType(featureType) {
        // Find the feature type in the dropdown listbox, set it to be selected
        $(_AOI_SELECTBOX).children('[value="' + featureType + '"]').attr('selected', 'selected');

        // Trigger change
        $(_AOI_SELECTBOX).change();
    }

    function deselectFeatureType() {
        $(_AOI_SELECTBOX).val('');
        
        $(_AVAILABLE_ATTRIBUTES).hide();
        $(_AVAILABLE_ATTRIBUTE_VALUES).hide();

        clearGeometryOverlay();
    }

    function bindAOISelectbox() {
        $(_AOI_SELECTBOX).change(function() {
            $(_AVAILABLE_ATTRIBUTES).fadeOut(Constant.ui.fadeSpeed);
            $(_AVAILABLE_ATTRIBUTE_VALUES).fadeOut(Constant.ui.fadeSpeed);

            var selectedFeatureType = $(_AOI_SELECTBOX).val();

            setGeometryOverlay(selectedFeatureType);

            // Don't get or show attributes and attribute values if user
            // selects a drawn or waters polygon.
            if (!/^(draw|waters):/.test(selectedFeatureType)) {
                WFS.callWFS({
                    'request': 'DescribeFeatureType',
                    'typename': selectedFeatureType
                },
                true,
                populateAttributesSelectbox
                );
                aoiHasAttributes = true;
            } else {
                // If geometry was dynamically created, it will just have a 
                // placeholder attribute. We need to know to return that
                // placeholder in getSelectedAttribute even though no attributes
                // have been selected.
                aoiHasAttributes = false;
                $(NEXT_BUTTON).button('option', 'disabled', false);
            }
            
            if (parseInt(Constant.ui.shapefile_downloading_allow)) {
                createShapefileDownloadLink(selectedFeatureType);
            }
            
            $(_CLEAR_AOI_BUTTON).fadeIn(Constant.ui.fadeSpeed);
            
            $(WFS.cachedGetCapabilities).find('FeatureType').each(function(i, elem) {
                if ($(elem).find('Name').text() == selectedFeatureType) {
                    var bbox = $(elem).find('ows|WGS84BoundingBox');
                    var lowerCorner = $(bbox).find('ows|LowerCorner').text().split(' ');
                    var upperCorner = $(bbox).find('ows|UpperCorner').text().split(' ');

                    var minx = lowerCorner[0];
                    var miny = lowerCorner[1];
                    var maxx = upperCorner[0];
                    var maxy = upperCorner[1];

                    AOI.attributeBounds = {
                        lowerCorner : minx + ' ' + miny,
                        upperCorner : maxx + ' ' + maxy
                    }
                }
            });  
            logger.debug('Bounds for chosen layer are: LOWER CORNER: ' + AOI.attributeBounds.lowerCorner + ', UPPER CORNER: ' + AOI.attributeBounds.upperCorner)
        });
    }

    function bindAvailableAttributesSelectbox() {
        $(_AVAILABLE_ATTRIBUTES_SELECTBOX).change(function() {
            $(_AVAILABLE_ATTRIBUTE_VALUES).hide();

            var selectedFeatureType = $(_AOI_SELECTBOX).val();
            var selectedAttribute = $(_AVAILABLE_ATTRIBUTES_SELECTBOX).val();
            var maxfeatures = parseInt(Constant.ui.view_max_polygons_shown) + 1;
            
            WFS.callWFS({
                'request': 'GetFeature',
                'info_format': 'text/xml',
                'typename': selectedFeatureType,
                'propertyname': selectedAttribute,
                'maxfeatures': maxfeatures 
            },
            true,
            populateAttributeValuesSelectbox);
        });
    }

    function bindAvailableAttributeValuesSelectbox() {
        $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).change(function() {
            var attrValues = [];
            $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX + ' :selected').each(function(index, elem) {
                attrValues.push($(elem).text());
            });

            if (attrValues.length == $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX + ' option').length) {
                attrValues = '*';
            }

            if (attrValues.length == 0) $(NEXT_BUTTON).button('option', 'disabled', true);
            else $(NEXT_BUTTON).button('option', 'disabled', false);

            var attr = $(_AVAILABLE_ATTRIBUTES_SELECTBOX).val();
            highlightFeatures(attr, attrValues);
            setSelectedAttributeBoundingBox(AOI.getSelectedFeatureType(), AOI.getSelectedAttribute(), AOI.getSelectedFeatures());
        });
    }
    
    function setSelectedAttributeBoundingBox() {
        var wfsXML = '<![CDATA[' + Dataset.createGetFeatureXML(AOI.getSelectedFeatureType(), AOI.getSelectedAttribute(), AOI.getSelectedFeatures(), {srs : 'EPSG:4326'}) + ']]>';
            
        if (wfsXML) {
            $.ajax( {
                url : Constant.endpoint.proxy + Constant.endpoint.ows,
                type : 'post',
                data : WPS.createGeoserverBoundingBoxWPSRequest(wfsXML),
                processData : false,
                dataType : 'xml',
                contentType : 'text/xml',
                context : this,
                success : function(data, textStatus, XMLHttpRequest) {
                    if ($(data).find('ExceptionReport ').length > 0) {
                        AOI.attributeBounds.lowerCorner = '-180 -90';
                        AOI.attributeBounds.upperCorner = '180 90';
                        logger.warn('Unable to retrieve bounds for chosen attribute. Resetting to default bounds: LOWER CORNER: ' + AOI.attributeBounds.lowerCorner + ', UPPER CORNER: ' + AOI.attributeBounds.upperCorner);
                        return;
                    }
                    AOI.attributeBounds.lowerCorner = $(data).find('LowerCorner')[0].textContent
                    AOI.attributeBounds.upperCorner = $(data).find('UpperCorner')[0].textContent
                    logger.debug('Bounds for chosen layer attribtue(s) are: LOWER CORNER: ' + AOI.attributeBounds.lowerCorner + ', UPPER CORNER: ' + AOI.attributeBounds.upperCorner)
                }, 
                error : function(jqXHR, textStatus, errorThrown) {
                    AOI.attributeBounds.lowerCorner = '-180 -90';
                    AOI.attributeBounds.upperCorner = '180 90';
                    logger.warn('Unable to retrieve bounds for chosen attribute. Resetting to default bounds: LOWER CORNER: ' + AOI.attributeBounds.lowerCorner + ', UPPER CORNER: ' + AOI.attributeBounds.upperCorner);
                }
            });  
        }
    }
    
    function bindClearAOIButton() {
        logger.debug('GDP: Clear Available AOI Button has been clicked.');
        $(_CLEAR_AOI_BUTTON).click(function () {
            clearGeometryOverlay();
            $(_CLEAR_AOI_BUTTON).fadeOut(Constant.ui.fadeSpeed);
            $(_AOI_SELECTBOX).find("option").prop('selected', false);
            $(_AVAILABLE_ATTRIBUTES_SELECTBOX).find("option").prop('selected', false);
            $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).find("option").prop('selected', false);
            $(_AVAILABLE_ATTRIBUTES).fadeOut(Constant.ui.fadeSpeed);
            $(_AVAILABLE_ATTRIBUTE_VALUES).fadeOut(Constant.ui.fadeSpeed);
            $(NEXT_BUTTON).button('option', 'disabled', true);            
        })
    }

    function createShapefileDownloadLink(selectedFeatureType) {
        if (!selectedFeatureType) selectedFeatureType = $(_AOI_SELECTBOX).val();
        $('#download_shapefile_link').fadeOut(Constant.ui.fadeSpeed);
        $('#download_shapefile_link_row').remove();
        if (selectedFeatureType) {
            var maxFeaturesToReturn = Constant.ui.shapefile_downloading_maxfeatures ?  '&maxFeatures=' + Constant.ui.shapefile_downloading_maxfeatures : '';
            var rootUrl = Constant.endpoint.proxy + Constant.endpoint.ows;
            var kvpParams = 'service=WFS&version=1.0.0&request=GetFeature&typeName='+selectedFeatureType + maxFeaturesToReturn + '&outputFormat=SHAPE-ZIP';
            $('#aoi-table tbody').append(
                $('<tr></tr>').append(
                    $('<td></td>').append(
                        $('<a></a>').
                        attr('id','download_shapefile_link').
                        attr('href', '#').
                        addClass('hidden bold-link').
                        html('Download Shapefile').
                        click(function() {
                            $.download(rootUrl,kvpParams,'get')
                        })
                        )
                    ).attr('id','download_shapefile_link_row')
                )
            $('#download_shapefile_link').fadeIn(Constant.ui.fadeSpeed);
        }
    }

    // Public members and methods
    return {
        htmlID: _HTML_ID,
        attributeBounds : _ATTRIBUTE_BOUNDS,
        init: function() {
            logger.info("GDP: Initializing Area of Interest.");
            
            setupShapefileServices();
            
            bindAOISelectbox();
            bindAvailableAttributesSelectbox();
            bindAvailableAttributeValuesSelectbox();
            
            updateFeatureTypesList();
            
            $(_AOI_SERVICES_BUTTON).button();
            
            $(_CLEAR_AOI_BUTTON).hide();
            bindClearAOIButton();
        },

        callDescribeFeatureType: function(featureType, callback) {
            WFS.callWFS({
                request: 'DescribeFeatureType',
                typeName: featureType
            },
            true, 
            callback);
        },

        updateFeatureTypesListAndSelect: function(featureType) {
            // Need to select the feature type only after the list has been updated
            updateFeatureTypesList(function() {
                selectFeatureType(featureType);
            });
        },

        getSelectedFeatureType: function() {
            return $(_AOI_SELECTBOX).val();
        },

        getSelectedAttribute: function() {
            if (aoiHasAttributes)
                return $(_AVAILABLE_ATTRIBUTES_SELECTBOX).val();
            else
                return _DEFAULT_ATTRIBUTE;
        },

        getSelectedFeatures: function() {
            // If aoi doesn't have attributes that matter (e.g. drawn and waters polygons),
            // just return ['*'].
            if (!aoiHasAttributes) return ['*'];

            var numSelected = $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX + ' :selected').length;
            var numOptions = $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX + ' option').length;
            if (numOptions == 0) return []; // Shortcut. This occurs if features hasn't been selected yet
            if (numSelected < numOptions) {
                // If some attribute values aren't selected, return array of all
                // respective id's of values that are selected.
                var selectedValues = $(_AVAILABLE_ATTRIBUTE_VALUES_SELECTBOX).val();
                var selectedIDs = [];
                
                if (selectedValues) {
                    for (var j = 0; j < selectedValues.length; j++) {
                        var valueIndex = $.inArray(selectedValues[j], valueToIDsMap.values);

                        selectedIDs = selectedIDs.concat(valueToIDsMap.IDs[valueIndex]);
                    }
                }

                return selectedIDs;
            } else {
                // If all elements are selected, return ['*']
                return ['*'];
            }
        },

        releaseToggleButton: function(button) {
            if (isDepressed(button)) $(button).click();
        },
        
        // A hook for when a step is appearing on the page
        stepLoading: function() {
            return true;
        }
    };
};
