var tokens = require('./index')
  , fs = require('fs')

var stdin = readable(fs.createReadStream('fixture'))
  , tks

console.time('init')
tks = tokens(stdin)
console.timeEnd('init')

drain(tks)

function drain(input) {
  var hrtime = process.hrtime()
    , saw = 0

  consume()

  function consume() {
    if(saw === 0) {
      console.time('tokens')
    }

    var sync = true

    while(sync) {
      sync = undefined

      input.read(read)

      sync = !!sync
    }

    function read(err, data) {
      ++saw

      if(data === undefined) {
        hrtime = process.hrtime(hrtime)
        console.log(
            '%dms %d tokens'
          , hrtime[0] * 1e3 + hrtime[1] / 1e6
          , saw
        )

        return
      }

      if(sync !== undefined) {
        //console.timeEnd('chunk')
        //console.time('chunk')
        consume()
      } else {
        sync = true
      }
    }
  }
}

function readable(from) {
  var pending = []

  from.once('end', function() {
    check = function() {
      while(pending.length) {
        pending.shift()()
      }
    }
    check()
  })

  return {read: read, abort: abort}

  function read(emit) {
    pending[pending.length] = emit
    check()
  }

  function check() {
    var output = from.read()

    if(!output) {
      return from.once('readable', check)
    }

    pending.shift()(null, output)
  }

  function abort(done) {
    pending.length = 0
    from.end()
    done()
  }
}
