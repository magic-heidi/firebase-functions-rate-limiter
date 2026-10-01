import { use as chaiUse, expect } from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import * as _ from 'lodash'
import * as sinon from 'sinon'
import { v4 as uuid } from 'uuid'
import 'mocha'

chaiUse(chaiAsPromised)

export { _, expect, sinon, uuid }
