//
// SPDX-FileCopyrightText: 2024 SAP SE or an SAP affiliate company and Gardener contributors
//
// SPDX-License-Identifier: Apache-2.0
//

import { computed } from 'vue'

import { useCloudProfileStore } from '@/store/cloudProfile'

import { useAnnotations } from '../useObjectMetadata'

import { NAND } from './helper'

import {
  get,
  set,
  unset,
  keyBy,
  mapValues,
} from '@/lodash'

const shootPropertyMappings = Object.freeze({
  cloudProfileName: 'spec.cloudProfileName',
  region: 'spec.region',
})

export const useShootAccessRestrictions = (shootItem, options = {}) => {
  const {
    cloudProfileStore = useCloudProfileStore(),
  } = options

  const {
    getAnnotation: getShootAnnotation,
    setAnnotation: setShootAnnotation,
    unsetAnnotation: unsetShootAnnotation,
  } = useAnnotations(shootItem)

  const {
    cloudProfileName,
    region,
  } = mapValues(shootPropertyMappings, path => {
    return computed(() => get(shootItem.value, path))
  })

  function getSeedSelectorMatchLabel (key, defaultValue) {
    return get(shootItem.value, `spec.seedSelector.matchLabels["${key}"]`, `${defaultValue}`)
  }

  function setSeedSelectorMatchLabel (key, value) {
    set(shootItem.value, `spec.seedSelector.matchLabels["${key}"]`, `${value}`)
  }

  function unsetSeedSelectorMatchLabel (key) {
    unset(shootItem.value, `spec.seedSelector.matchLabels["${key}"]`)
  }

  const accessRestrictionDefinitionList = computed(() => {
    return cloudProfileStore.accessRestrictionDefinitionsByCloudProfileNameAndRegion({
      cloudProfileName: cloudProfileName.value,
      region: region.value,
    })
  })

  const accessRestrictionNoItemsText = computed(() => {
    return cloudProfileStore.accessRestrictionNoItemsTextForCloudProfileNameAndRegion({
      cloudProfileName: cloudProfileName.value,
      region: region.value,
    })
  })

  const accessRestrictionDefinitions = computed(() => {
    const accessRestrictionDefinitions = {}
    for (const definition of accessRestrictionDefinitionList.value) {
      const { key, options } = definition
      set(accessRestrictionDefinitions, [key], {
        ...definition,
        options: keyBy(options, 'key'),
      })
    }
    return accessRestrictionDefinitions
  })

  const accessRestrictionOptionDefinitions = computed(() => {
    const accessRestrictionOptionDefinitions = {}
    for (const definition of accessRestrictionDefinitionList.value) {
      for (const optionDefinition of definition.options) {
        accessRestrictionOptionDefinitions[optionDefinition.key] = {
          accessRestrictionKey: definition.key,
          ...optionDefinition,
        }
      }
    }
    return accessRestrictionOptionDefinitions
  })

  function getAccessRestrictionValue (key) {
    const { input } = get(accessRestrictionDefinitions.value, [key])
    const inverted = !!input?.inverted
    const defaultValue = inverted
    const value = getSeedSelectorMatchLabel(key, defaultValue) === 'true'
    return NAND(value, inverted)
  }

  function setAccessRestrictionValue (key, value) {
    const { input, options } = get(accessRestrictionDefinitions.value, [key])
    const enabled = NAND(value, !!input?.inverted)
    if (enabled) {
      setSeedSelectorMatchLabel(key, 'true')
    } else {
      unsetSeedSelectorMatchLabel(key)
    }
    for (const key of Object.keys(options)) {
      if (enabled) {
        setAccessRestrictionOptionValue(key, false)
      } else {
        unsetShootAnnotation(key)
      }
    }
  }

  function getAccessRestrictionOptionValue (key) {
    const { accessRestrictionKey } = get(accessRestrictionOptionDefinitions.value, [key])
    const { input } = get(accessRestrictionDefinitions.value, [accessRestrictionKey, 'options', key])
    const inverted = !!input?.inverted
    const defaultValue = inverted
    const value = getShootAnnotation(key, `${defaultValue}`) === 'true'
    return NAND(value, inverted)
  }

  function setAccessRestrictionOptionValue (key, value) {
    const { accessRestrictionKey } = get(accessRestrictionOptionDefinitions.value, [key])
    const { input } = get(accessRestrictionDefinitions.value, [accessRestrictionKey, 'options', key])
    const inverted = !!input?.inverted
    setShootAnnotation(key, `${NAND(value, inverted)}`)
  }

  function getAccessRestrictionPatchData () {
    const data = {}
    for (const definition of accessRestrictionDefinitionList.value) {
      const path = `spec.seedSelector.matchLabels["${definition.key}"]`
      set(data, path, get(shootItem.value, path, null))
      for (const optionDefinition of definition.options) {
        const path = `metadata.annotations["${optionDefinition.key}"]`
        set(data, path, get(shootItem.value, path, null))
      }
    }
    return data
  }

  const accessRestrictionList = computed(() => {
    const accessRestrictionList = []
    for (const definition of accessRestrictionDefinitionList.value) {
      const {
        key,
        display: {
          visibleIf = false,
          title = key,
          description,
        },
        options: optionDefinitions,
      } = definition

      const value = getAccessRestrictionValue(key)
      if (visibleIf !== value) {
        continue // skip
      }

      const accessRestrictionOptionList = []
      for (const optionDefinition of optionDefinitions) {
        const {
          key,
          display: {
            visibleIf = false,
            title = key,
            description,
          },
        } = optionDefinition

        const value = getAccessRestrictionOptionValue(key)
        if (value !== visibleIf) {
          continue // skip
        }

        accessRestrictionOptionList.push({
          key,
          title,
          description,
        })
      }

      accessRestrictionList.push({
        key,
        title,
        description,
        options: accessRestrictionOptionList,
      })
    }

    return accessRestrictionList
  })

  return {
    accessRestrictionDefinitionList,
    accessRestrictionNoItemsText,
    accessRestrictionDefinitions,
    accessRestrictionOptionDefinitions,
    getAccessRestrictionValue,
    setAccessRestrictionValue,
    getAccessRestrictionOptionValue,
    setAccessRestrictionOptionValue,
    getSeedSelectorMatchLabel,
    setSeedSelectorMatchLabel,
    unsetSeedSelectorMatchLabel,
    accessRestrictionList,
    getAccessRestrictionPatchData,
  }
}
