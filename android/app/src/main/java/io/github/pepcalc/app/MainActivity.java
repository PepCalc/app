package io.github.pepcalc.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins register before the bridge starts.
        registerPlugin(CameraAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
