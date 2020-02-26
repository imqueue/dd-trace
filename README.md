<h1 align="center">@imqueue/dd-trace</h1>
<hr>
<p align="center">
    <strong>Integration package with Datadog tracing for @imqueue</strong>
</p>
<hr>

## What Is This?

This library provides a clean way to integrate 
[@imqueue/rpc](https://github.com/imqueue/rpc) with 
[Datadog](https://www.datadoghq.com/) 
[tracing](https://www.npmjs.com/package/dd-trace).

## Install

As easy as:

~~~bash
npm i --save @imqueue/dd-trace
~~~ 

## Usage & API

### Importing, instantiation and connecting

At the top of your entry file (service or client):

~~~typescript
import tracer  from '@imqueue/dd-trace';
tracer.init();
export default tracer;
~~~

This does not differ of original `dd-trace` and exposes the whole functionality
from it. To learn more about `dd-trace` API and features, follow this
[link](https://docs.datadoghq.com/tracing/setup/nodejs/).

### Extended API

Withing the package `@imqueue/dd-trace` provides also some valuable
functions, giving the ability to instrument and send traces manually inside
your code.

For example, if you need to trace some specific block of code, do it as:

~~~typescript
import { trace, traceEnd } from '@imqueue/dd-trace';

// ... whenever you want to trace a block of code do as:

trace('block-of-code-trace-name');

// ... code comes here

traceEnd('block-of-code-trace-name');
~~~

Please, note that trace name given to `trace()` function must be unique in
your code or it will produce exception.

There is also a way to decorate any non-exposed service or client methods, 
using `@traced()` decorator factory.

For example:

~~~typescript
import { traced } from '@imqueue/dd-trace';

class MySpecificClassOrService {

    @traced()
    private doSomething() {
        console.log('Something...');
    }

    @traced()
    protected doAnotherThing() {
        console.log('Another thing!');
    }

    @traced()
    public doCoolStuff() {
        this.doHidden();
        console.log('Cool stuff!');
    }
    
    private doHidden() {
        console.log('Hidden stuff!');
    }
}
~~~

With this example, only `doSomething`, `doAnotherThing` and `doCoolStuff`
methods will be traced, but `doHidden` remain un-traced.

Please, note, that every method on client and server, which are decorated
with `@expose` will be automatically traced if `@imqueue/dd-trace` was set-up
and initialized (and enabled via DD trace env config). Plugin name for 
DD trace config is `imq`.

## Contributing

Any contributions are greatly appreciated. Feel free to fork, propose PRs, open
issues, do whatever you think may be helpful to this project. PRs which passes
all tests and do not brake tslint rules are first-class candidates to be
accepted!

## License

[ISC](https://github.com/imqueue/dd-trace/blob/master/LICENSE)

Happy Coding!
